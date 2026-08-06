This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 다대포 해변 맥주 축제 · 해변 가요제 모바일 앱

공개 배포용 모바일 앱은 `hosting-festival` 폴더에 있습니다.

- 로컬 확인: `cd hosting-festival && python -m http.server 8092`
- Firebase Hosting 타깃: `festival` (`dadaepo-festival.web.app`)
- 비로그인 QR 스탬프 설계: [`docs/festival-login-development-guide.md`](docs/festival-login-development-guide.md)

명세서 기준 1차 참여 흐름은 로그인 화면 없이 Firebase 익명 인증으로 시작합니다. 실제 Firebase UID를 쓰려면 콘솔에서 `Authentication > Sign-in method > Anonymous`를 먼저 켜야 합니다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
