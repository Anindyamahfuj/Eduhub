import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default function Page({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export async function getServerSideProps() {
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
}
