# Локальный сервер разработки: как python -m http.server, но с запретом кэширования.
# Без него браузер кэширует text/babel-скрипты, и после правки кода исполняется
# смесь старых и новых файлов.
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 3000))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
        print(f'Architector dev server: http://localhost:{PORT}')
        httpd.serve_forever()
