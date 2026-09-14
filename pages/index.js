/**
 * Next.js Index Page Handler
 * 
 * This file serves the StudyHub dashboard as the main page.
 */
import { GetServerSideProps } from 'next';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface PageProps {
  html: string;
}

export default function Page({ html }: PageProps) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export const getServerSideProps: GetServerSideProps = async () => {
  const publicDir = join(process.cwd(), 'public');
  const filePath = join(publicDir, 'index.html');
  
  if (existsSync(filePath)) {
    const html = readFileSync(filePath, 'utf-8');
    return { props: { html } };
  }

  return {
    props: {
      html: '<h1>StudyHub</h1><p>Loading...</p>',
    },
  };
};
