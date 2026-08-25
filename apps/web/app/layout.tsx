import './globals.css';
import type { Metadata } from 'next';
export const metadata:Metadata={title:'Local Prospector',description:'Prospecção B2B local, persistente e autônoma'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
