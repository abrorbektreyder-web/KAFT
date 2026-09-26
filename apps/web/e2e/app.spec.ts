// Muhim oqimlar (PRD 10: unit + muhim oqimlar uchun e2e): kirish, bosh sahifa, qidiruv, til, mavzu, chiqish.
import { expect, test, type Page } from "@playwright/test";

const USER = { email: "e2e-hr@kaft.test", password: "E2e-test-parol-2026" };
const KASSIR = { email: "e2e-kassir@kaft.test", password: USER.password };
const SAVDO = { email: "e2e-savdo@kaft.test", password: USER.password };

async function login(page: Page, user = USER) {
  await page.goto("/kirish");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Parol", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Kirish" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Test");
}

test.beforeEach(async ({ context }) => {
  // Har test o'zbekcha va kunduzgi mavzudan boshlanadi
  await context.addCookies([{ name: "kaft-locale", value: "uz", url: "http://localhost:3000" }]);
  // Faqat birinchi ochilishda — keyin foydalanuvchi tanlovi saqlanishi tekshiriladi
  await context.addInitScript(() => { if (!localStorage.getItem("theme")) localStorage.setItem("theme", "light"); });
});

test("kirmagan foydalanuvchi kirish sahifasiga yo‘naltiriladi", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/kirish$/);
  await expect(page.getByRole("button", { name: "Kirish" })).toBeVisible();
});

test("parolni ko‘rsatish/yashirish tugmasi", async ({ page }) => {
  await page.goto("/kirish");
  const input = page.getByLabel("Parol", { exact: true });
  await input.fill("sir-parol");
  await expect(input).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Parolni ko‘rsatish" }).click();
  await expect(input).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Parolni yashirish" }).click();
  await expect(input).toHaveAttribute("type", "password");
});

test("noto‘g‘ri parol — xato xabari, bosh sahifa ochilmaydi", async ({ page }) => {
  await page.goto("/kirish");
  await page.getByLabel("Email").fill(USER.email);
  await page.getByLabel("Parol", { exact: true }).fill("notogri-parol-000");
  await page.getByRole("button", { name: "Kirish" }).click();
  await expect(page.getByText("Email yoki parol noto‘g‘ri")).toBeVisible();
  await expect(page).toHaveURL(/\/kirish$/);
});

test("kirgandan keyin bosh sahifada «Kim qayerda» haqiqiy ma’lumot bilan", async ({ page }) => {
  await login(page);
  const team = page.getByRole("region", { name: "Kim qayerda" });
  await expect(team.getByText("5 xodim")).toBeVisible();
  await expect(page.getByText("Bugun ishda")).toBeVisible();
  await expect(page.getByText("4 / 5")).toBeVisible();
  // Ta'tildagi xodim «Bugun yo'qlar» ro'yxatida
  await expect(page.getByText("E2eova Malika")).toBeVisible();
});

test("qidiruv xodimni topadi", async ({ page }) => {
  await login(page);
  await page.goto("/qidiruv?q=qidiruvbek");
  await expect(page.getByText("Qidiruvbek Jasur")).toBeVisible();
});

test("til: rus tiliga o‘tadi va qayta yuklanganda saqlanadi (CORE-08)", async ({ page, isMobile }) => {
  await login(page);
  if (isMobile) await page.getByRole("button", { name: /Bildirishnomalar/ }).click();
  await page.getByRole("radio", { name: "Ру" }).filter({ visible: true }).click();
  await expect(page.getByText("Кто где")).toBeVisible();
  // Tizim eslatmasi ham rus tilida (ism esa kiritilganicha)
  // Bo‘limning ruscha nomi (xodim ismi o‘zgarmaydi)
  await expect(page.getByText("E2E отдел").first()).toBeVisible();
  // Kompaniyaning ruscha nomi
  await expect(page.getByText("E2E компания").first()).toBeVisible();
  await expect(page.getByText("Rahimova Dilnoza — сегодня день рождения").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Кто где")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

test("mavzu: tungi mavzuga o‘tadi va saqlanadi", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Tungi mavzu" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("chiqish — sessiya yopiladi", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Chiqish" }).click();
  await expect(page).toHaveURL(/\/kirish$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/kirish$/);
});

test("telefon o‘lchamida gorizontal aylantirish yo‘q", async ({ page }) => {
  await login(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("pul: kassir faqat o‘z kassasini ko‘radi, kirim kiritadi — qoldiq oshadi (FIN-01/02)", async ({ page }, info) => {
  await login(page, KASSIR);
  await page.goto("/pul");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pul");
  const row = page.getByRole("row", { name: /E2E kassa/ });
  await expect(row).toBeVisible();
  await expect(page.getByText("Boshqa kassa")).toHaveCount(0);
  const balance = async () => Number((await row.locator("td").nth(2).innerText()).replace(/\D/g, ""));
  const before = await balance();

  const note = `E2E kirim ${info.project.name}`;
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await page.getByLabel(/^Summa/).fill("250 000");
  await page.getByLabel("Modda").click();
  await page.getByRole("option", { name: "Sotuvdan tushum" }).click();
  await page.getByLabel("Kontragent").click();
  await page.getByRole("option", { name: "E2E hamkor" }).click();
  await page.getByLabel("Izoh").fill(note);
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Saqlandi")).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await expect.poll(balance).toBe(before + 250_000);
  // Kassir bekor qila olmaydi (PRD 8) — tugma yo'q
  await expect(page.getByRole("button", { name: "Bekor qilish" })).toHaveCount(0);
});

test("kontragent: savdo menejeri qo‘shadi, tahriri egaga tasdiqqa ketadi (CP-01/02)", async ({ page }, info) => {
  await login(page, SAVDO);
  await page.goto("/kontragentlar");
  // Faqat o'z mijozlari ko'rinadi
  await expect(page.getByRole("link", { name: "E2E hamkor" })).toBeVisible();
  await page.getByRole("button", { name: "Kontragent qo‘shish" }).click();
  const name = `E2E Mijoz ${info.project.name}`;
  await page.getByRole("textbox", { name: "Nomi", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("90 123 45 67");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("+998901234567")).toBeVisible();

  await page.getByRole("button", { name: "Tahrirlash" }).click();
  await page.getByLabel("To‘lov muddati (kun)").fill("15");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("O‘zgarish egaga tasdiqqa yuborildi")).toBeVisible();
  await expect(page.getByText("Tasdiq kutilmoqda")).toBeVisible();
  // Karta hali o'zgarmagan, tasdiqlash tugmasi savdo menejerida yo'q
  await expect(page.getByRole("main").getByRole("button", { name: "Tasdiqlash" })).toHaveCount(0);
});

test("savdo: menejer o‘z mijoziga sotadi, qarz kontragent kartasida ko‘rinadi (SAL-01)", async ({ page }) => {
  await login(page, SAVDO);
  await page.goto("/savdo/yangi");
  await page.getByLabel("Kontragent", { exact: true }).click();
  await page.getByRole("option", { name: "E2E do‘kon" }).click();
  await page.getByLabel("Tovar", { exact: true }).click();
  await page.getByRole("option", { name: /E2E suv/ }).click();
  await page.getByLabel("Miqdor, dona").fill("10");
  await page.getByRole("button", { name: "Saqlash" }).click();
  // 10 × 5 000 so'm (chakana narx avtomatik)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^S-\d{6}$/);
  await expect(page.getByText(/50\s000 so‘m/).first()).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "E2E do‘kon" }).click();
  await expect(page.getByText("Bizga qarz (mijoz)")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /^S-\d{6}$/ }).first()).toBeVisible();
});

test("kassa yopish: kassir haqiqiy qoldiqni kiritadi, farq ko‘rinadi (FIN-08)", async ({ page }, info) => {
  await login(page, KASSIR);
  await page.goto("/pul/yopish");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kunlik kassa yopish");
  // Har loyiha o'z kunini yopadi (kuniga bir marta qoidasi)
  const d = new Date(Date.now() + 5 * 3_600_000 - (info.project.name === "telefon" ? 86_400_000 : 0)).toISOString().slice(0, 10);
  await page.getByLabel("Sana", { exact: true }).fill(d);
  await page.getByLabel(/^Sanalgan summa/).fill("1");
  await page.getByRole("button", { name: "Kassani yopish" }).click();
  await expect(page.getByText(/Kassa yopildi — farq/)).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`${d.slice(8, 10)}\.${d.slice(5, 7)}\.${d.slice(0, 4)}`) })).toBeVisible();
  // Kassir prognoz va foyda-zararni ko'rmaydi
  await expect(page.getByRole("link", { name: "Prognoz" })).toHaveCount(0);
});

