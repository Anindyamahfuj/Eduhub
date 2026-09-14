import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default function Page({ html, is404 }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export async function getServerSideProps(context) {
  const { req } = context;
  const path = req.url?.split('?')[0] || '/';

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

  const publicDir = join(process.cwd(), 'public');
  let filePath = join(publicDir, path);

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

  if (path === '/') {
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf-8');
      return { props: { html, is404: false } };
    }
  }

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
}
