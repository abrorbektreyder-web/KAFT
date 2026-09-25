// Muhim oqimlar (PRD 10: unit + muhim oqimlar uchun e2e): kirish, bosh sahifa, qidiruv, til, mavzu, chiqish.
import { expect, test, type Page } from "@playwright/test";

const USER = { email: "e2e-hr@kaft.test", password: "E2e-test-parol-2026" };
const KASSIR = { email: "e2e-kassir@kaft.test", password: USER.password };

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
  await page.getByLabel("Izoh").fill(note);
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Saqlandi")).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await expect.poll(balance).toBe(before + 250_000);
  // Kassir bekor qila olmaydi (PRD 8) — tugma yo'q
  await expect(page.getByRole("button", { name: "Bekor qilish" })).toHaveCount(0);
});

