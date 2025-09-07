import axios from 'axios';
import { JSDOM } from 'jsdom';

export async function fetchAndParseHTML(url: string): Promise<Document> {
  console.log(`Fetching ${url}...`);
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout: 30000
  });
  
  const dom = new JSDOM(response.data, { url });
  console.log(`Successfully fetched and parsed ${url}`);
  
  return dom.window.document;
}
