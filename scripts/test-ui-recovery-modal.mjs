import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4176;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOT_PATH = process.env.SCREENSHOT_PATH || '/tmp/n2sac-recovery-modal.png';

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    stdio: 'ignore',
    detached: true,
  });

  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem('n2sac_telemetry_consent_v1', 'denied');
      localStorage.setItem(
        'nsac_expressive_session_v2',
        JSON.stringify({
          account_id: 9999,
          nsac_email: 'teste@unesp.br',
          class_code: 'INI3A',
          token: 'fictional-test-token',
        }),
      );
      localStorage.setItem(
        'n2sac_seen_grades_v1:9999',
        JSON.stringify({
          '2026|sociologia|1': { grade: 8.0, recovery: false, recoveryCode: 'NAC' },
          '2026|sociologia|2': { grade: 9.2, recovery: false, recoveryCode: 'NAC' },
          '2026|sociologia|3': { grade: 4.8, recovery: true, recoveryCode: 'REC' },
          '2026|fisica|1': { grade: 7.0, recovery: false, recoveryCode: 'NAC' },
          '2026|fisica|2': { grade: 7.2, recovery: false, recoveryCode: 'NAC' },
          '2026|fisica|3': { grade: 5.0, recovery: true, recoveryCode: 'REC' },
        }),
      );
    });

    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/me')) {
        return route.fulfill({
          json: {
            success: true,
            data: {
              account_id: 9999,
              ra: '9999999',
              name: 'Aluno Teste',
              turma: 'INI3A',
              ranking_opted_in: false,
            },
          },
        });
      }
      if (url.includes('/account/ranking-preferences') || url.includes('/compare/preferences')) {
        return route.fulfill({
          json: {
            success: true,
            data: {
              account_id: 9999,
              opted_in: true,
              hide_name: false,
              has_decided: true,
              display_name: null,
              show_avatar: false,
              public_profile: true,
              discoverable: true,
              invisible: false,
            },
          },
        });
      }
      if (url.includes('/nsac/boletim')) {
        return route.fulfill({
          json: {
            success: true,
            next_poll_hint_secs: 300,
            data: {
              data: [
                {
                  year: 2026,
                  turma: 'INI3A',
                  status: 'Em andamento',
                  grades: [
                    {
                      subjectName: 'Sociologia',
                      bimesters: [
                        { bimester: 1, personal: { grade: 8.0, absences: 0, recovery: false, recoveryCode: '' }, class: { averageGrade: 8.2 } },
                        { bimester: 2, personal: { grade: 9.2, absences: 2, recovery: false, recoveryCode: '' }, class: { averageGrade: 8.4 } },
                        { bimester: 3, personal: { grade: 4.8, absences: 4, recovery: true, recoveryCode: 'NC' }, class: { averageGrade: 8.6 } },
                      ],
                      results: { totalAbsences: 6, finalGrade: null, approved: false },
                    },
                    {
                      subjectName: 'Física',
                      bimesters: [
                        { bimester: 1, personal: { grade: 7.0, absences: 0, recovery: false, recoveryCode: '' }, class: { averageGrade: 6.9 } },
                        { bimester: 2, personal: { grade: 7.2, absences: 2, recovery: false, recoveryCode: '' }, class: { averageGrade: 6.7 } },
                        { bimester: 3, personal: { grade: 5.0, absences: 2, recovery: true, recoveryCode: 'NC' }, class: { averageGrade: 6.8 } },
                      ],
                      results: { totalAbsences: 4, finalGrade: null, approved: false },
                    },
                  ],
                },
              ],
            },
          },
        });
      }
      return route.fulfill({ json: { success: true, data: {} } });
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    try {
      await page.waitForSelector('text=Sim, participar', { timeout: 2500 });
      await page.locator('button:has-text("Sim, participar")').click();
      await page.waitForSelector('text=Participar do Ranking?', { state: 'hidden', timeout: 3000 });
    } catch {
      // ranking consent modal did not appear
    }
    await page.waitForSelector('text=atualizações de recuperação', { timeout: 8000 });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    console.log(`SUCCESS: ${SCREENSHOT_PATH}`);
  } catch (err) {
    if (browser) {
      const pages = browser.contexts()[0]?.pages() || [];
      if (pages[0]) await pages[0].screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    }
    throw err;
  } finally {
    if (browser) await browser.close();
    try {
      process.kill(-server.pid);
    } catch {
      // already exited
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
