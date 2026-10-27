# TeraPlayer — ওয়েবসাইট হিসেবে চালানো

## গুরুত্বপূর্ণ: এটা GitHub Pages-এ চলবে না
এটা Node Express সার্ভার, শুধু স্ট্যাটিক HTML নয়। তাই
`play.mthtamim.bond`-এর বর্তমান GitHub Pages সেটআপে এটা
চলবে না। ওয়েবসাইট করতে হলে Node চালাতে পারে এমন হোস্ট
লাগবে, যেমন Render, Railway, বা VPS।

## অপশন ১: Render (ফ্রি, সবচেয়ে সহজ)
1. এই প্যাকেজটি GitHub-এ পুশ করো (`.env` ছাড়া, `.gitignore`
   ইতিমধ্যে `.env` আর `node_modules` বাদ দেয়)।
2. Render-এ New → Web Service → ওই রিপো বেছে নাও।
   `render.yaml` থাকায় Build `npm install`, Start `node server.js`
   নিজে থেকে বসে যাবে।
3. Environment-এ শুধু প্রয়োজনে `TERABOX_NDUS` দাও। এটা
   Render-এর ভেতরে থাকে, পাবলিক হয় না। না দিলেও সাইট চলে,
   তখন প্রক্সি ফলব্যাক ব্যবহার হতে পারে।
4. সাইট চালু হলে Render-এর ঠিকানা পাবে, যেমন
   `https://teraplayer.onrender.com`।

## অপশন ২: নিজের ডোমেইন (play.mthtamim.bond)
Render-এ Custom Domain যোগ করে Cloudflare-এ CNAME বদলাতে
হবে। বর্তমান CNAME `play → mthtamim.github.io` (GitHub Pages)
বদলে Render-এর দেওয়া ঠিকানায় দিতে হবে। এটা করলে পুরোনো
স্ট্যাটিক সাইটটি আর ওই সাবডোমেইনে থাকবে না — তাই ডোমেইন
বদলানোর আগে নিশ্চিত হও।

## লোকালে চালানো
```bash
pnpm install
pnpm start
# http://localhost:3000
```

## কখনো করবে না
- `.env` ফাইল GitHub-এ পুশ করা যাবে না।
- সার্ভারের Settings-এ দেওয়া ndus এখন আর `.env`-এ লেখা হয়
  না, শুধু মেমোরিতে থাকে।
