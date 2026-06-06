import fs from 'fs';

async function test() {
  const query = encodeURIComponent('cleaners hyderabad');
  const url = `https://search.yahoo.com/search?p=${query}`;
  console.log('Fetching Yahoo search:', url);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    const html = await response.text();
    
    // Look for phone numbers in the text of the page
    const phoneRegex = /(?:(?:\+|0{0,2})91[\s-]*)?[6-9]\d{9}|(?:0?\d{2,5}[\s-]*\d{6,8})/g;
    const matches = html.match(phoneRegex) || [];
    console.log('Total phone matches found in Yahoo HTML text:', matches.length);
    console.log('Unique matches:', [...new Set(matches)]);
    
    // Parse links
    const re = /href="([^"]+?)"/g;
    let m;
    const allHrefs = [];
    while ((m = re.exec(html)) !== null) {
      allHrefs.push(m[1]);
    }
    const yahooSearchLinks = allHrefs.filter(h => h.includes('r.search.yahoo.com'));
    
    const targets = [];
    yahooSearchLinks.forEach((link) => {
      const match = link.match(/\/RU=([^/]+)/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        if (!/yahoo\.com|yimg\.|google\./.test(decoded)) {
          targets.push(decoded);
        }
      }
    });
    
    console.log('Found targets:', [...new Set(targets)]);
  } catch (err) {
    console.error(err);
  }
}

test();
