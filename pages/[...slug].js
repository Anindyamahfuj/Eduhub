/**
 * Next.js Catch-All Page Handler
 * 
 * This file serves the original StudyHub frontend as static files.
 * The frontend files are copied to public/ during build.
 */
import { GetServerSideProps } from 'next';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface PageProps {
  html: string;
  is404: boolean;
}

export default function Page({ html, is404 }: PageProps) {
  if (is404) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { req } = context;
  const path = req.url?.split('?')[0] || '/';
  
  // Serve 404 page
  if (path === '/404') {
    const publicDir = join(process.cwd(), 'public');
    const filePath = join(publicDir, '404.html');
    
    if (existsSync(filePath)) {
      const html = readFileSync(filePath, 'utf-8');
      return { props: { html, is404: true } };
    }
    
    return {
      props: {
        html: '<h1>404 - Page Not Found</h1>',
        is404: true,
      },
    };
  }

  // Serve static HTML files
  const publicDir = join(process.cwd(), 'public');
  let filePath = join(publicDir, path);
  
  // If path doesn't end with .html, try adding it
  if (!filePath.endsWith('.html')) {
    if (existsSync(filePath + '.html')) {
      filePath += '.html';
    } else if (existsSync(join(filePath, 'index.html'))) {
      filePath = join(filePath, 'index.html');
    }
  }

  if (existsSync(filePath)) {
    const html = readFileSync(filePath, 'utf-8');
    return { props: { html, is404: false } };
  }

  // Default to index.html for root
  if (path === '/') {
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf-8');
      return { props: { html, is404: false } };
    }
  }

  // 404 fallback
  const notFoundPath = join(publicDir, '404.html');
  if (existsSync(notFoundPath)) {
    const html = readFileSync(notFoundPath, 'utf-8');
    return { props: { html, is404: true } };
  }

  return {
    props: {
      html: '<h1>404 - Page Not Found</h1>',
      is404: true,
    },
  };
};
