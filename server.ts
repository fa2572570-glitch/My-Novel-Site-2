import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import * as cheerio from 'cheerio';
import {
  EDGE_TTS_VOICE,
  AUDIO_CACHE_DIR,
  METADATA_CACHE_DIR,
  planChapterChunks,
  synthesizeChunk,
  preloadChunks,
  getTTSCacheStats,
  clearTTSCache
} from './server/ttsService';

const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json());

  // Helper to generate range of URLs
  function getUrlsInRange(startUrl: string, endUrl: string): { url: string; index: number }[] {
    const regex = /\d+/g;
    const startMatches = [...startUrl.matchAll(regex)];
    const endMatches = [...endUrl.matchAll(regex)];

    if (startMatches.length === 0 || endMatches.length === 0 || startMatches.length !== endMatches.length) {
      return [{ url: startUrl, index: 1 }];
    }

    let diffIndex = -1;
    for (let i = 0; i < startMatches.length; i++) {
      if (startMatches[i][0] !== endMatches[i][0]) {
        diffIndex = i;
        break;
      }
    }

    if (diffIndex === -1) {
      return [{ url: startUrl, index: parseInt(startMatches[startMatches.length - 1][0], 10) || 1 }];
    }

    const startNum = parseInt(startMatches[diffIndex][0], 10);
    const endNum = parseInt(endMatches[diffIndex][0], 10);
    const startIdx = startMatches[diffIndex].index!;
    const startLen = startMatches[diffIndex][0].length;

    const prefix = startUrl.substring(0, startIdx);
    const suffix = startUrl.substring(startIdx + startLen);

    const urls: { url: string; index: number }[] = [];
    const step = startNum <= endNum ? 1 : -1;
    const count = Math.abs(endNum - startNum) + 1;

    // Cap the range to prevent excessive requests
    const maxChapters = 500;
    const actualCount = Math.min(count, maxChapters);

    for (let i = 0; i < actualCount; i++) {
      const currentNum = startNum + (i * step);
      let numStr = String(currentNum);
      if (startMatches[diffIndex][0].startsWith('0') && startMatches[diffIndex][0].length > 1) {
        numStr = numStr.padStart(startMatches[diffIndex][0].length, '0');
      }
      urls.push({
        url: prefix + numStr + suffix,
        index: currentNum
      });
    }

    return urls;
  }

  // API Route: Generate a list of URLs from start and end range
  app.post('/api/generate-urls', (req, res) => {
    try {
      const { startUrl, endUrl } = req.body;
      if (!startUrl || !endUrl) {
        return res.status(400).json({ error: 'Both startUrl and endUrl are required' });
      }

      const urls = getUrlsInRange(startUrl.trim(), endUrl.trim());
      return res.json({ urls });
    } catch (error: any) {
      console.error('Error in /api/generate-urls:', error);
      return res.status(500).json({ error: error.message || 'Server error' });
    }
  });

  // API Route: Fetch and parse a single chapter URL
  app.post('/api/fetch-page', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      console.log(`Fetching URL: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch page: ${response.statusText}` });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Smart title extraction
      let title = '';
      const titleSelectors = [
        '.entry-title',
        'h1.entry-title',
        'h1.post-title',
        '.chapter-title',
        'h1',
        'h2',
        'title'
      ];
      
      const IGNORED_BRANDS = ['novellunar', 'novelbin', 'webnovel', 'readnovelfull', 'freewebnovel', '404'];

      for (const selector of titleSelectors) {
        const elements = $(selector);
        let foundValid = false;
        elements.each((_, el) => {
          const text = $(el).text().trim();
          if (text) {
            const lowerText = text.toLowerCase();
            // Check if this text is EXACTLY one of the ignored brands
            if (!IGNORED_BRANDS.includes(lowerText)) {
              title = text;
              foundValid = true;
              return false; // Break the each loop
            }
          }
        });
        if (foundValid) break; // Break the selector loop
      }

      // Fallback if everything was an ignored brand (cleanGenericChapter will fix it later)
      if (!title) {
        title = $('h1').first().text().trim() || 'Imported Chapter';
      }

      // If title is from <title> tag, clean up common site names
      if (title && title === $('title').text().trim()) {
        title = title.split(' - ')[0].split(' | ')[0].trim();
      }

      // Smart content extraction
      let contentElement: cheerio.Cheerio<any> | null = null;
      const contentSelectors = [
        '.entry-content',
        '#chapter-content',
        '.chapter-content',
        '.post-content',
        'article',
        '#content',
        '.content',
        '.post-body'
      ];

      for (const selector of contentSelectors) {
        const el = $(selector);
        if (el.length > 0) {
          contentElement = el.first();
          break;
        }
      }

      // Clean up the DOM before paragraph extraction
      if (contentElement) {
        // Clean only the content element to be safe and avoid stripping global page elements
        contentElement.find('form, label, input, textarea, button, select, noscript, iframe, script, style, svg, link, meta').remove();
        contentElement.find('[id*="comment"], [class*="comment"], [id*="respond"], [class*="respond"], [id*="reply"], [class*="reply"], [id*="author"], [class*="author"], [id*="email"], [class*="email"]').remove();
        contentElement.find('.sharedaddy, .wpcnt, #jp-post-flair, .adsbygoogle, #comments, .comments-area, .wpr-rating, .rating, .wp-block-comments, .comment-list, .comment-form, .ads, .ad-container, .advertisement, .social-sharing, .share-buttons').remove();
      } else {
        // Fallback: clean the whole body
        $('body').find('form, label, input, textarea, button, select, noscript, iframe, script, style, svg, link, meta').remove();
        $('body').find('[id*="comment"], [class*="comment"], [id*="respond"], [class*="respond"], [id*="reply"], [class*="reply"], [id*="author"], [class*="author"], [id*="email"], [class*="email"]').remove();
        $('body').find('.sharedaddy, .wpcnt, #jp-post-flair, .adsbygoogle, #comments, .comments-area, .wpr-rating, .rating, .wp-block-comments, .comment-list, .comment-form, .ads, .ad-container, .advertisement, .social-sharing, .share-buttons, header, footer, nav, #sidebar, .sidebar, .widgets').remove();
      }

      const paragraphs: string[] = [];

      if (contentElement) {
        // Find all p tags inside contentElement
        contentElement.find('p').each((_, p) => {
          const pText = $(p).text().trim();
          if (pText) {
            paragraphs.push(pText);
          }
        });

        // Fallback: if no p tags found, split by line breaks or div tags
        if (paragraphs.length === 0) {
          contentElement.find('div').each((_, div) => {
            const divText = $(div).text().trim();
            if (divText && $(div).children().length === 0) {
              paragraphs.push(divText);
            }
          });
          
          if (paragraphs.length === 0) {
            const text = contentElement.text();
            text.split('\n').forEach(line => {
              const trimmed = line.trim();
              if (trimmed) {
                paragraphs.push(trimmed);
              }
            });
          }
        }
      } else {
        // Extreme fallback: find any paragraphs in the page
        $('p').each((_, p) => {
          // Exclude typical header/footer paragraphs if they are outside a main article
          const parent = $(p).parent();
          if (parent.is('header') || parent.is('footer') || parent.is('nav')) {
            return;
          }
          const pText = $(p).text().trim();
          if (pText) {
            paragraphs.push(pText);
          }
        });
      }

      // Clean up paragraphs: remove typical links/buttons/translators notes/comment fields/boilerplate
      let cutOffIndex = -1;
      for (let i = 0; i < paragraphs.length; i++) {
        const pText = paragraphs[i].trim();
        const lower = pText.toLowerCase();
        
        if (
          lower === 'name' || 
          lower === 'email' || 
          lower === 'website' || 
          lower === 'comment' || 
          lower === 'leave a reply' || 
          lower === 'leave a comment' || 
          lower === 'cancel reply' ||
          lower === 'post comment' ||
          lower.includes('comment form') ||
          lower.includes('post comment') ||
          lower.includes('add a comment') ||
          lower.includes('submit comment') ||
          lower.includes('cdata') ||
          lower.includes('ak_js') ||
          lower.includes('document.getelementbyid') ||
          pText.startsWith('Δ')
        ) {
          cutOffIndex = i;
          break;
        }
      }

      const slicedParagraphs = cutOffIndex !== -1 ? paragraphs.slice(0, cutOffIndex) : paragraphs;

      const filteredParagraphs = slicedParagraphs.filter(p => {
        const lower = p.toLowerCase();
        
        // Exclude JS fragments, CDATA, comments metadata, and common wordpress comment form noise
        if (
          lower.includes('cdata') || 
          lower.includes('document.getelementbyid') || 
          lower.includes('window.ads') || 
          lower.includes('var ') || 
          lower.includes('function(') ||
          lower.includes('ak_js') ||
          lower.includes('<![cdata[') ||
          lower.includes(']]>')
        ) {
          return false;
        }

        // Filter out single word fields that are common Wordpress comment labels
        if (lower === 'name' || lower === 'email' || lower === 'website' || lower === 'comment' || lower === 'leave a reply' || lower === 'cancel reply') {
          return false;
        }

        // Skip common navigation text or empty looking lines
        if (lower === 'next chapter' || lower === 'previous chapter' || lower === 'table of contents' || lower === 'index') {
          return false;
        }
        if (lower.startsWith('next chapter') || lower.startsWith('previous chapter')) {
          return false;
        }
        if (lower.includes('bcatranslation.com') && (lower.includes('visit') || lower.includes('support') || lower.includes('read'))) {
          return false;
        }
        // Filter out cookie consent or tiny standard sharing junk
        if (lower.includes('share this:') || lower.includes('like this:')) {
          return false;
        }
        return true;
      });

      return res.json({
        title: title || 'Untitled Chapter',
        paragraphs: filteredParagraphs
      });

    } catch (error: any) {
      console.error('Error fetching/parsing page:', error);
      return res.status(500).json({ error: error.message || 'Server error' });
    }
  });

  // --- MICROSOFT EDGE READ ALOUD TTS API ROUTES ---

  // 1. TTS Health & Status
  app.get('/api/tts/status', (req, res) => {
    res.json({
      status: 'ok',
      voice: EDGE_TTS_VOICE,
      cache: getTTSCacheStats()
    });
  });

  // TTS Cache Statistics
  app.get('/api/tts/stats', (req, res) => {
    res.json(getTTSCacheStats());
  });

  // Clear TTS Cache
  app.post('/api/tts/cache/clear', (req, res) => {
    try {
      const result = clearTTSCache();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to clear cache' });
    }
  });

  // 2. Plan Chapter Chunks & Check Cache
  app.post('/api/tts/plan', (req, res) => {
    try {
      const { chapter, novelId, voice, pitch } = req.body;
      if (!chapter || !chapter.id) {
        return res.status(400).json({ error: 'Chapter with id is required' });
      }

      const plan = planChapterChunks(chapter, novelId || 'novel', { voice, pitch });
      return res.json(plan);
    } catch (error: any) {
      console.error('Error in /api/tts/plan:', error);
      return res.status(500).json({ error: error.message || 'Failed to plan TTS chunks' });
    }
  });

  // 3. Synthesize or Fetch Single Chunk from Cache
  app.post('/api/tts/chunk', async (req, res) => {
    try {
      const { chunk } = req.body;
      if (!chunk || !chunk.hash || !chunk.text) {
        return res.status(400).json({ error: 'Valid chunk object with hash and text is required' });
      }

      const metadata = await synthesizeChunk(chunk);
      return res.json(metadata);
    } catch (error: any) {
      console.error('Error in /api/tts/chunk:', error);
      return res.status(500).json({ error: error.message || 'Failed to synthesize TTS chunk' });
    }
  });

  // 4. Serve Cached Audio File (with Range request support for mobile Chrome seeking)
  app.get('/api/tts/audio/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(AUDIO_CACHE_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    res.sendFile(filePath, {
      acceptRanges: true,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  });

  // 5. Serve Cached Metadata JSON
  app.get('/api/tts/metadata/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(METADATA_CACHE_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Metadata file not found' });
    }

    res.sendFile(filePath, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  });

  // 6. Background Preload Chunks
  app.post('/api/tts/preload', async (req, res) => {
    try {
      const { chunks } = req.body;
      if (Array.isArray(chunks) && chunks.length > 0) {
        preloadChunks(chunks).catch(err => console.warn('TTS preload error:', err));
        return res.json({ scheduled: chunks.length });
      }
      return res.json({ scheduled: 0 });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Preload failed' });
    }
  });

  // Serve static assets / Vite
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Serve static files in production
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${port}`);
  });
}

startServer();
