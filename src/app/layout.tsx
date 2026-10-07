import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AlojaOS',
  description: 'El sistema de reservas de tu complejo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
