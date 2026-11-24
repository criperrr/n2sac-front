# n²sac — frontend & mobile

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Cliente Web e Android (`com.cti.n2sac`) do **n²sac** para estudantes do Colégio Técnico Industrial (CTI — UNESP Bauru), construído com React 19, TypeScript, Vite, Material 3 Expressive (`@material/material-color-utilities`) e Capacitor 7.

- **Site & App:** [https://notebook-server.tailddd6bf.ts.net/inicio](https://notebook-server.tailddd6bf.ts.net/inicio)
- **Backend (Rust):** [`criperrr/n2sac`](https://github.com/criperrr/n2sac)
- **Releases Android (APK assinado):** [GitHub Releases](https://github.com/criperrr/n2sac/releases)

---

## Desenvolvimento local

```bash
npm install
npm run dev
```

Build de produção:

```bash
npx tsc -b && npm run build
```

---

## Licença

Este projeto é licenciado sob a **GNU Affero General Public License v3.0 (AGPL-3.0)** — veja o arquivo [LICENSE](./LICENSE) para o texto completo.

Qualquer pessoa pode estudar, modificar e redistribuir o código, mas **qualquer versão modificada distribuída ou executada em servidor/rede deve manter 100% do código-fonte aberto sob a mesma licença AGPL-3.0**, impedindo apropriação comercial em código fechado.
