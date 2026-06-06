async function test() {
  const query = 'cleaners in hyderabad';
  console.log('Fetching DDG Lite:');
  try {
    const response = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `q=${encodeURIComponent(query)}`
    });
    console.log('Response Status:', response.status);
    const html = await response.text();
    console.log('HTML Length:', html.length);
    console.log('Contains search results:', html.includes('result-link') || html.includes('class="result') || html.includes('href="http'));
    
    // Check if we are blocked
    const isBlocked = html.includes('captcha') || html.includes('challenge-form') || html.includes('anomaly-modal');
    console.log('Is Blocked:', isBlocked);
    
    // Parse links
    const re = /href="([^"]+?)"/g;
    let m;
    const links = [];
    while ((m = re.exec(html)) !== null && links.length < 50) {
      const href = m[1];
      if (href.startsWith('http') && !/duckduckgo\.com/.test(href)) {
        links.push(href);
      }
    }
    console.log('Found Links:', links.length);
    console.log('Sample links:', links.slice(0, 10));
    
  } catch (err) {
    console.error(err);
  }
}

test();
