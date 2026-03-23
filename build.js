#!/usr/bin/env node
/**
 * Build script for Akhilesh Malani's website
 *
 * Reads Markdown blog posts from content/blog/,
 * converts them to HTML pages matching the existing blog template,
 * and auto-generates feed.xml and updates sitemap.xml.
 *
 * Existing hand-written blog HTML files in blog/ are preserved.
 * Only files created by the CMS (with matching .md in content/blog/) are regenerated.
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Simple Markdown to HTML converter (no dependencies needed)
// ============================================================
function markdownToHtml(md) {
  let html = md;

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (match, lang, code) {
    var escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<pre><code>' + escaped.trim() + '</code></pre>';
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');
  // Merge adjacent blockquotes
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, '\n');

  // Unordered lists
  html = html.replace(/^(?:- (.+)\n?)+/gm, function (match) {
    var items = match.trim().split('\n').map(function (line) {
      return '<li>' + line.replace(/^- /, '') + '</li>';
    }).join('\n          ');
    return '<ul>\n          ' + items + '\n        </ul>';
  });

  // Ordered lists
  html = html.replace(/^(?:\d+\. (.+)\n?)+/gm, function (match) {
    var items = match.trim().split('\n').map(function (line) {
      return '<li>' + line.replace(/^\d+\. /, '') + '</li>';
    }).join('\n          ');
    return '<ol>\n          ' + items + '\n        </ol>';
  });

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Paragraphs - wrap remaining text blocks
  var lines = html.split('\n\n');
  lines = lines.map(function (block) {
    block = block.trim();
    if (!block) return '';
    // Don't wrap blocks that are already HTML elements
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|div|section|article|nav|aside|table|figure|p)/.test(block)) {
      return block;
    }
    return '<p>' + block.replace(/\n/g, ' ') + '</p>';
  });

  return lines.filter(function (b) { return b; }).join('\n\n        ');
}

// ============================================================
// Parse frontmatter from Markdown files
// ============================================================
function parseFrontmatter(content) {
  var match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  var meta = {};
  match[1].split('\n').forEach(function (line) {
    var colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;
    var key = line.substring(0, colonIndex).trim();
    var value = line.substring(colonIndex + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  });

  return { meta: meta, body: match[2] };
}

// ============================================================
// Format date
// ============================================================
function formatDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function formatRssDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00+05:30');
  return d.toUTCString().replace('GMT', '+0530');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// Generate blog HTML page from template
// ============================================================
function generateBlogPage(meta, bodyHtml, slug) {
  var title = meta.title || 'Untitled';
  var description = meta.description || '';
  var date = meta.date || new Date().toISOString().split('T')[0];
  var keywords = meta.keywords || 'accessibility';
  var url = 'https://akhileshmalani.com/blog/' + slug + '.html';
  var encodedTitle = encodeURIComponent(title);
  var encodedUrl = encodeURIComponent(url);

  // Estimate reading time
  var wordCount = bodyHtml.replace(/<[^>]+>/g, '').split(/\s+/).length;
  var readTime = Math.max(1, Math.ceil(wordCount / 200));

  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'  <meta name="description" content="' + escapeHtml(description) + '">\n' +
'  <meta name="author" content="Akhilesh Malani">\n' +
'  <meta name="keywords" content="' + escapeHtml(keywords) + '">\n' +
'  <link rel="canonical" href="' + url + '">\n' +
'\n' +
'  <!-- Open Graph -->\n' +
'  <meta property="og:type" content="article">\n' +
'  <meta property="og:title" content="' + escapeHtml(title) + ' | Akhilesh Malani">\n' +
'  <meta property="og:description" content="' + escapeHtml(description) + '">\n' +
'  <meta property="og:url" content="' + url + '">\n' +
'\n' +
'  <title>' + escapeHtml(title) + ' | Akhilesh Malani</title>\n' +
'  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' rx=\'16\' fill=\'%231a5276\'/%3E%3Ctext x=\'50\' y=\'38\' text-anchor=\'middle\' font-family=\'Georgia,serif\' font-size=\'36\' font-weight=\'bold\' fill=\'%23ffffff\'%3EA%3C/text%3E%3Ctext x=\'50\' y=\'72\' text-anchor=\'middle\' font-family=\'Georgia,serif\' font-size=\'36\' font-weight=\'bold\' fill=\'%235dade2\'%3EM%3C/text%3E%3C/svg%3E">\n' +
'  <link rel="stylesheet" href="../styles.css">\n' +
'  <style>\n' +
'    .blog-post { max-width: 780px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }\n' +
'    .blog-post-header { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 2px solid var(--color-border); }\n' +
'    .blog-post-header h1 { font-size: 2rem; line-height: 1.3; color: var(--color-primary-dark); margin-bottom: 0.75rem; }\n' +
'    .blog-meta { color: var(--color-text-light); font-size: 0.95rem; }\n' +
'    .blog-meta time { font-weight: 600; }\n' +
'    .blog-post-content h2 { font-size: 1.4rem; color: var(--color-primary); margin-top: 2.5rem; margin-bottom: 1rem; }\n' +
'    .blog-post-content h3 { font-size: 1.15rem; margin-top: 2rem; margin-bottom: 0.75rem; }\n' +
'    .blog-post-content p { margin-bottom: 1.25rem; line-height: 1.8; }\n' +
'    .blog-post-content ul, .blog-post-content ol { margin-bottom: 1.25rem; padding-left: 1.5rem; }\n' +
'    .blog-post-content li { margin-bottom: 0.5rem; line-height: 1.7; }\n' +
'    .blog-post-content blockquote { border-left: 4px solid var(--color-primary); padding: 1rem 1.5rem; margin: 1.5rem 0; background: var(--color-bg-alt); border-radius: 0 var(--radius) var(--radius) 0; font-style: italic; }\n' +
'    .blog-post-content code { background: var(--color-bg-alt); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.9em; }\n' +
'    .blog-post-content pre { background: var(--color-bg-alt); padding: 1.25rem; border-radius: var(--radius); overflow-x: auto; margin: 1.25rem 0; border: 1px solid var(--color-border); }\n' +
'    .blog-post-content pre code { background: none; padding: 0; font-size: 0.88em; line-height: 1.6; }\n' +
'    .blog-nav { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 0; margin-top: 2rem; border-top: 2px solid var(--color-border); }\n' +
'    .blog-nav a { color: var(--color-primary); font-weight: 600; text-decoration: none; }\n' +
'    .blog-nav a:hover { text-decoration: underline; }\n' +
'    .share-section { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }\n' +
'    .share-section h2 { font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--color-text); }\n' +
'    .share-buttons { display: flex; gap: 0.75rem; flex-wrap: wrap; }\n' +
'    .share-btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.2rem; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 600; transition: all 0.2s ease; }\n' +
'    .share-btn:hover { transform: translateY(-2px); }\n' +
'    .share-btn:focus-visible { outline: 3px solid var(--color-focus, #2471a3); outline-offset: 3px; }\n' +
'    .share-btn--linkedin { background: #0077b5; color: #fff; }\n' +
'    .share-btn--linkedin:hover { background: #005e93; color: #fff; }\n' +
'    .share-btn--twitter { background: #1da1f2; color: #fff; }\n' +
'    .share-btn--twitter:hover { background: #0d8ecf; color: #fff; }\n' +
'    .share-btn--email { background: var(--color-bg-alt, #f4f6f9); color: var(--color-text, #1a1a2e); border: 1px solid var(--color-border, #d5dbe3); }\n' +
'    .share-btn--email:hover { background: var(--color-border, #d5dbe3); }\n' +
'    .share-btn svg { width: 18px; height: 18px; flex-shrink: 0; }\n' +
'    @media (max-width: 600px) {\n' +
'      .blog-post-header h1 { font-size: 1.5rem; }\n' +
'    }\n' +
'  </style>\n' +
'  <script>\n' +
'    (function(){var h=document.documentElement;var t=localStorage.getItem(\'theme\');if(t){h.setAttribute(\'data-theme\',t)}else if(window.matchMedia&&window.matchMedia(\'(prefers-color-scheme:dark)\').matches){h.setAttribute(\'data-theme\',\'dark\')}var s=localStorage.getItem(\'a11y-text-size\');if(s&&s!==\'normal\')h.setAttribute(\'data-text-size\',s);if(localStorage.getItem(\'a11y-high-contrast\')===\'true\')h.setAttribute(\'data-high-contrast\',\'true\');if(localStorage.getItem(\'a11y-dyslexia-font\')===\'true\')h.setAttribute(\'data-dyslexia-font\',\'true\');if(localStorage.getItem(\'a11y-reduce-motion\')===\'true\')h.setAttribute(\'data-reduce-motion\',\'true\')})();\n' +
'  </script>\n' +
'</head>\n' +
'<body>\n' +
'  <a href="#main-content" class="skip-link">Skip to main content</a>\n' +
'\n' +
'  <header class="site-header" role="banner">\n' +
'    <nav class="navbar" aria-label="Primary navigation">\n' +
'      <div class="nav-container">\n' +
'        <a href="../index.html" class="nav-brand" aria-label="Akhilesh Malani - Home">Akhilesh Malani</a>\n' +
'        <a href="../index.html#blog" class="btn-text">&larr; Back to Blog</a>\n' +
'        <div class="nav-actions">\n' +
'          <button class="a11y-toggle" id="a11y-toggle" aria-label="Accessibility settings" type="button">\n' +
'            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v10"/><path d="M7 11l5-1.5 5 1.5"/><path d="M9 21l3-4 3 4"/></svg>\n' +
'          </button>\n' +
'          <button class="theme-toggle" id="theme-toggle" aria-label="Switch to dark mode" type="button">\n' +
'            <svg id="theme-icon-sun" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>\n' +
'            <svg id="theme-icon-moon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>\n' +
'          </button>\n' +
'        </div>\n' +
'      </div>\n' +
'    </nav>\n' +
'  </header>\n' +
'\n' +
'  <!-- Accessibility Preferences Panel -->\n' +
'  <div id="a11y-backdrop" class="a11y-backdrop"></div>\n' +
'  <div id="a11y-panel" class="a11y-panel" role="dialog" aria-labelledby="a11y-panel-title" aria-modal="true" hidden>\n' +
'    <div class="a11y-panel-header">\n' +
'      <h2 id="a11y-panel-title" tabindex="-1">Accessibility Settings</h2>\n' +
'      <button type="button" class="a11y-panel-close" id="a11y-panel-close" aria-label="Close accessibility settings">&times;</button>\n' +
'    </div>\n' +
'    <div class="a11y-panel-body">\n' +
'      <fieldset class="a11y-option">\n' +
'        <legend>Text Size</legend>\n' +
'        <div class="a11y-text-sizes" role="group" aria-label="Text size options">\n' +
'          <button type="button" class="a11y-size-btn" data-size="normal" aria-pressed="true"><span style="font-size:0.85em">A</span><span class="sr-only"> Normal</span></button>\n' +
'          <button type="button" class="a11y-size-btn" data-size="large" aria-pressed="false"><span style="font-size:1.1em">A</span><span class="sr-only"> Large</span></button>\n' +
'          <button type="button" class="a11y-size-btn" data-size="larger" aria-pressed="false"><span style="font-size:1.4em">A</span><span class="sr-only"> Larger</span></button>\n' +
'        </div>\n' +
'      </fieldset>\n' +
'      <div class="a11y-option">\n' +
'        <div class="a11y-switch-row">\n' +
'          <span class="a11y-switch-label" id="label-contrast">High Contrast</span>\n' +
'          <button type="button" role="switch" aria-checked="false" aria-labelledby="label-contrast" id="a11y-contrast" class="a11y-switch"></button>\n' +
'        </div>\n' +
'      </div>\n' +
'      <div class="a11y-option">\n' +
'        <div class="a11y-switch-row">\n' +
'          <span class="a11y-switch-label" id="label-dyslexia">Dyslexia-Friendly Font</span>\n' +
'          <button type="button" role="switch" aria-checked="false" aria-labelledby="label-dyslexia" id="a11y-dyslexia" class="a11y-switch"></button>\n' +
'        </div>\n' +
'      </div>\n' +
'      <div class="a11y-option">\n' +
'        <div class="a11y-switch-row">\n' +
'          <span class="a11y-switch-label" id="label-motion">Reduce Motion</span>\n' +
'          <button type="button" role="switch" aria-checked="false" aria-labelledby="label-motion" id="a11y-motion" class="a11y-switch"></button>\n' +
'        </div>\n' +
'      </div>\n' +
'      <button type="button" class="a11y-reset" id="a11y-reset">Reset All Preferences</button>\n' +
'    </div>\n' +
'  </div>\n' +
'\n' +
'  <main id="main-content">\n' +
'    <nav aria-label="Breadcrumb" class="breadcrumb">\n' +
'      <ol>\n' +
'        <li><a href="../index.html">Home</a></li>\n' +
'        <li><a href="../index.html#blog">Blog</a></li>\n' +
'        <li><span aria-current="page">' + escapeHtml(title) + '</span></li>\n' +
'      </ol>\n' +
'    </nav>\n' +
'    <article class="blog-post" aria-label="Blog post">\n' +
'      <header class="blog-post-header">\n' +
'        <h1>' + escapeHtml(title) + '</h1>\n' +
'        <p class="blog-meta">\n' +
'          By <strong>Akhilesh Malani</strong> &middot; <time datetime="' + date + '">' + formatDate(date) + '</time> &middot; ' + readTime + ' min read\n' +
'        </p>\n' +
'      </header>\n' +
'\n' +
'      <div class="blog-post-content">\n' +
'        ' + bodyHtml + '\n' +
'      </div>\n' +
'\n' +
'      <div class="share-section">\n' +
'        <h2>Share this article</h2>\n' +
'        <div class="share-buttons">\n' +
'          <a href="https://www.linkedin.com/sharing/share-offsite/?url=' + encodedUrl + '" target="_blank" rel="noopener noreferrer" class="share-btn share-btn--linkedin" aria-label="Share on LinkedIn (opens in new tab)">\n' +
'            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>\n' +
'            LinkedIn\n' +
'          </a>\n' +
'          <a href="https://twitter.com/intent/tweet?text=' + encodedTitle + '&url=' + encodedUrl + '" target="_blank" rel="noopener noreferrer" class="share-btn share-btn--twitter" aria-label="Share on X/Twitter (opens in new tab)">\n' +
'            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>\n' +
'            X / Twitter\n' +
'          </a>\n' +
'          <a href="mailto:?subject=' + encodedTitle + '&body=Read this article: ' + encodedUrl + '" class="share-btn share-btn--email" aria-label="Share via email">\n' +
'            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>\n' +
'            Email\n' +
'          </a>\n' +
'        </div>\n' +
'      </div>\n' +
'\n' +
'      <nav class="blog-nav" aria-label="Blog navigation">\n' +
'        <a href="../index.html#blog">&larr; All Posts</a>\n' +
'      </nav>\n' +
'    </article>\n' +
'  </main>\n' +
'\n' +
'  <footer class="site-footer" role="contentinfo">\n' +
'    <div class="container">\n' +
'      <p>&copy; 2026 Akhilesh Malani. All rights reserved.</p>\n' +
'    </div>\n' +
'  </footer>\n' +
'\n' +
'  <script type="application/ld+json">\n' +
'  {\n' +
'    "@context": "https://schema.org",\n' +
'    "@type": "Article",\n' +
'    "headline": "' + escapeHtml(title) + '",\n' +
'    "description": "' + escapeHtml(description) + '",\n' +
'    "datePublished": "' + date + '",\n' +
'    "dateModified": "' + date + '",\n' +
'    "author": {\n' +
'      "@type": "Person",\n' +
'      "name": "Akhilesh Malani",\n' +
'      "url": "https://akhileshmalani.com",\n' +
'      "jobTitle": "Senior Accessibility Architect"\n' +
'    },\n' +
'    "publisher": {\n' +
'      "@type": "Person",\n' +
'      "name": "Akhilesh Malani",\n' +
'      "url": "https://akhileshmalani.com"\n' +
'    },\n' +
'    "mainEntityOfPage": "' + url + '",\n' +
'    "articleSection": "Accessibility",\n' +
'    "keywords": ' + JSON.stringify(keywords.split(',').map(function(k) { return k.trim(); })) + ',\n' +
'    "wordCount": ' + wordCount + ',\n' +
'    "timeRequired": "PT' + readTime + 'M"\n' +
'  }\n' +
'  </script>\n' +
'  <script src="../script.js"></script>\n' +
'</body>\n' +
'</html>';
}

// ============================================================
// Generate RSS feed
// ============================================================
function generateRssFeed(posts) {
  var items = posts.map(function (post) {
    return '    <item>\n' +
      '      <title>' + escapeHtml(post.title) + '</title>\n' +
      '      <link>https://akhileshmalani.com/blog/' + post.slug + '.html</link>\n' +
      '      <guid isPermaLink="true">https://akhileshmalani.com/blog/' + post.slug + '.html</guid>\n' +
      '      <pubDate>' + formatRssDate(post.date) + '</pubDate>\n' +
      '      <description>' + escapeHtml(post.description) + '</description>\n' +
      '      <author>akhilesh.malani@gmail.com (Akhilesh Malani)</author>\n' +
      '    </item>';
  }).join('\n\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
'  <channel>\n' +
'    <title>Akhilesh Malani - Accessibility Blog</title>\n' +
'    <link>https://akhileshmalani.com</link>\n' +
'    <description>Insights on digital accessibility from Akhilesh Malani — a blind accessibility architect with 16+ years of experience helping organisations build inclusive digital products.</description>\n' +
'    <language>en</language>\n' +
'    <managingEditor>akhilesh.malani@gmail.com (Akhilesh Malani)</managingEditor>\n' +
'    <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n' +
'    <atom:link href="https://akhileshmalani.com/feed.xml" rel="self" type="application/rss+xml"/>\n' +
'\n' + items + '\n\n' +
'  </channel>\n' +
'</rss>';
}

// ============================================================
// Generate sitemap
// ============================================================
function generateSitemap(posts) {
  var today = new Date().toISOString().split('T')[0];

  var staticPages = [
    { url: 'https://akhileshmalani.com/', priority: '1.0', freq: 'weekly' },
    { url: 'https://akhileshmalani.com/checker.html', priority: '0.9', freq: 'monthly' },
    { url: 'https://akhileshmalani.com/doc-checker.html', priority: '0.9', freq: 'monthly' },
    { url: 'https://akhileshmalani.com/accessibility.html', priority: '0.6', freq: 'monthly' }
  ];

  var urls = staticPages.map(function (p) {
    return '  <url>\n    <loc>' + p.url + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>' + p.freq + '</changefreq>\n    <priority>' + p.priority + '</priority>\n  </url>';
  });

  posts.forEach(function (post) {
    urls.push('  <url>\n    <loc>https://akhileshmalani.com/blog/' + post.slug + '.html</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>');
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n';
}

// ============================================================
// Main build
// ============================================================
function build() {
  var contentDir = path.join(__dirname, 'content', 'blog');
  var blogDir = path.join(__dirname, 'blog');

  // Collect all blog posts (both CMS-generated and existing hand-written ones)
  var allPosts = [];

  // 1. Process CMS markdown files → generate HTML
  if (fs.existsSync(contentDir)) {
    var mdFiles = fs.readdirSync(contentDir).filter(function (f) { return f.endsWith('.md'); });

    mdFiles.forEach(function (mdFile) {
      var slug = mdFile.replace('.md', '');
      var content = fs.readFileSync(path.join(contentDir, mdFile), 'utf8');
      var parsed = parseFrontmatter(content);
      var bodyHtml = markdownToHtml(parsed.body);
      var html = generateBlogPage(parsed.meta, bodyHtml, slug);

      // Write HTML to blog/ directory
      fs.writeFileSync(path.join(blogDir, slug + '.html'), html, 'utf8');
      console.log('[CMS] Generated: blog/' + slug + '.html');

      allPosts.push({
        slug: slug,
        title: parsed.meta.title || slug,
        date: parsed.meta.date || '2026-01-01',
        description: parsed.meta.description || ''
      });
    });

    console.log('CMS posts processed: ' + mdFiles.length);
  }

  // 2. Scan existing HTML blog files for metadata (for RSS/sitemap)
  var existingHtmlFiles = fs.readdirSync(blogDir).filter(function (f) { return f.endsWith('.html'); });
  existingHtmlFiles.forEach(function (htmlFile) {
    var slug = htmlFile.replace('.html', '');
    // Skip if already processed from CMS
    if (allPosts.some(function (p) { return p.slug === slug; })) return;

    var html = fs.readFileSync(path.join(blogDir, htmlFile), 'utf8');
    var titleMatch = html.match(/<title>(.*?)(?:\s*\|.*)?<\/title>/);
    var descMatch = html.match(/<meta name="description" content="(.*?)"/);
    var dateMatch = html.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/);

    allPosts.push({
      slug: slug,
      title: titleMatch ? titleMatch[1].trim() : slug,
      date: dateMatch ? dateMatch[1] : '2026-01-01',
      description: descMatch ? descMatch[1] : ''
    });
  });

  // Sort posts by date (newest first)
  allPosts.sort(function (a, b) { return b.date.localeCompare(a.date); });

  // 3. Generate RSS feed
  var rssFeed = generateRssFeed(allPosts);
  fs.writeFileSync(path.join(__dirname, 'feed.xml'), rssFeed, 'utf8');
  console.log('[RSS] Generated feed.xml with ' + allPosts.length + ' posts');

  // 4. Generate sitemap
  var sitemap = generateSitemap(allPosts);
  fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap, 'utf8');
  console.log('[SITEMAP] Generated sitemap.xml with ' + (allPosts.length + 4) + ' URLs');

  console.log('\nBuild complete! Total blog posts: ' + allPosts.length);
}

build();
