import type { Metadata } from 'next';
import { NewUploadProvider } from '@/components/NewUploadContext';
import { Nav } from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Encrypt_exchange - encrypted file sharing',
  description: 'Encrypt_exchange is a free, open-source, encrypted file sharing service.',
  applicationName: 'Encrypt_exchange',
  icons: {
    icon: [
      { url: '/favicon.png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'Encrypt_exchange - encrypted file sharing',
    description: 'Encrypt_exchange is a free, open-source, encrypted file sharing service.',
    siteName: 'Encrypt_exchange',
    images: ['/social-share-home.jpg'],
    type: 'website',
  },
  twitter: {
    title: 'Encrypt_exchange - encrypted file sharing',
    card: 'summary_large_image',
    site: 'Encrypt_exchange_App',
    images: ['/social-share-home.jpg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-900 bg-repeat" style={{ backgroundImage: 'url(/bg.jpg)' }}>
        <NewUploadProvider>
          <Nav />
          <main>{children}</main>
        </NewUploadProvider>
      </body>
    </html>
  );
}
