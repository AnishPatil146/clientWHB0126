import requests
import re
import urllib.parse

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

url = "https://www.bing.com/search?q=" + urllib.parse.quote("cleaning products wholesale Hyderabad")
res = requests.get(url, headers=headers, timeout=15)
print("Status:", res.status_code)
print("Response length:", len(res.text))

# find all h2 tags case insensitively
h2s = re.findall(r'<h2[^>]*>.*?</h2>', res.text, re.IGNORECASE | re.DOTALL)
print("Found h2 tags:", len(h2s))
for i, h2 in enumerate(h2s[:10]):
    print(f"{i}: {h2}")

# find all links in the text
links = re.findall(r'href="([^"]+)"', res.text)
print("Total links:", len(links))
for link in links[:20]:
    print("Link:", link)
