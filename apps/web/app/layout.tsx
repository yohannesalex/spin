import type { Metadata, Viewport } from 'next';
import { Header } from '@/components/Header';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Spin Draw',
  description: 'Pick a number, spin the wheel, win 80% of the pot.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0f17' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
