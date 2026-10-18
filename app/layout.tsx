import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'Nathaly Manicure | Seu espaço de cuidado',description:'Agenda, clientes e gestão do seu espaço de beleza.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR"><body>{children}</body></html>;}
