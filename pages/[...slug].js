import { readFileSync, existsSync, statSync } from 'fs';
import { join, sep } from 'path';

export default function Page({ html, is404 }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * True only for a regular file. existsSync() alone is not enough: public/
 * contains directories (public/admin, public/static/uploads), and
 * readFileSync() on a directory throws EISDIR, which surfaced as a hard 500
 * on /admin and /static/uploads instead of a page.
 */
function isFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
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

  // Never serve anything outside public/. Rejecting a path that escapes the
  // root also keeps a URL like /../../etc/passwd from reading the filesystem.
  if (!filePath.startsWith(publicDir + sep)) {
    filePath = join(publicDir, '404.html');
  }

  if (!filePath.endsWith('.html')) {
    if (isFile(filePath + '.html')) {
      filePath += '.html';
    } else if (isFile(join(filePath, 'index.html'))) {
      filePath = join(filePath, 'index.html');
    }
  }

  if (isFile(filePath)) {
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
