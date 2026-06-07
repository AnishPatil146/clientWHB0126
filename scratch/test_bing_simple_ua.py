import requests
import re
import urllib.parse

headers = {
    'User-Agent': 'Mozilla/5.0'
}

url = "https://www.bing.com/search?q=" + urllib.parse.quote("cleaning products wholesale Hyderabad")
res = requests.get(url, headers=headers, timeout=15)
print("Status:", res.status_code)
print("Response length:", len(res.text))

# find all h2 tags
h2s = re.findall(r'<h2[^>]*>.*?</h2>', res.text, re.IGNORECASE | re.DOTALL)
print("Found h2 tags:", len(h2s))
for i, h2 in enumerate(h2s):
    # check if there is an anchor link in the h2
    a_match = re.search(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h2, re.IGNORECASE | re.DOTALL)
    if a_match:
        href = a_match.group(1)
        title = re.sub(r'<[^>]+>', '', a_match.group(2)).strip()
        print(f"\nResult {i}:")
        print("URL:", href)
        print("Title:", title)
        
        # Now try to find the corresponding snippet in the HTML
        # In Bing, the snippet usually comes after the h2 in a <p> or <div class="b_caption">
        # Let's search for a paragraph or text close to the h2 in the page
        h2_pos = res.text.find(h2)
        following_text = res.text[h2_pos + len(h2): h2_pos + len(h2) + 600]
        snippet_match = re.search(r'<p[^>]*>(.*?)</p>', following_text, re.IGNORECASE | re.DOTALL)
        if snippet_match:
            snippet = re.sub(r'<[^>]+>', '', snippet_match.group(1)).strip()
            print("Snippet:", snippet)
