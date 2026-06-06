import fs from 'fs';

async function test() {
  // Direct listing URL from JustDial
  const url = 'https://www.justdial.com/Hyderabad/Residential-Cleaning-Services/nct-10968877';
  console.log('Fetching direct JustDial listing:', url);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    console.log('Response Status:', response.status);
    const html = await response.text();
    fs.writeFileSync('scratch/jd_direct_test.html', html, 'utf-8');
    console.log('HTML Length:', html.length);
    console.log('Contains ld+json:', html.includes('application/ld+json'));
    
    // Let's check for business name and phone in the HTML
    const title = html.match(/<title>([\s\S]*?)<\/title>/i);
    console.log('Title:', title ? title[1].trim() : 'No title');
    
    // Look for telephone in Schema.org ld+json
    const schemaMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    console.log('Found ld+json script tags:', schemaMatches.length);
    schemaMatches.forEach((match, idx) => {
      const jsonText = match.replace(/<script[^>]*>|<\/script>/gi, '').trim();
      try {
        const schema = JSON.parse(jsonText);
        console.log(`Schema ${idx} keys:`, Object.keys(schema));
        if (schema.name) console.log('Name:', schema.name);
        if (schema.telephone) console.log('Phone:', schema.telephone);
        if (schema.address) console.log('Address:', typeof schema.address === 'object' ? JSON.stringify(schema.address) : schema.address);
      } catch (e) {
        console.log(`Schema ${idx} is not valid JSON or deep arrays:`, e.message);
      }
    });
  } catch (err) {
    console.error(err);
  }
}

test();
