import { test, expect } from '@playwright/test';
test.beforeEach(async ({page}) => {
  await page.route('https://r2.leadsy.ai/**', route => route.abort());
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
});
for (const width of [320, 390, 768, 1440]) {
  test(`Homepage works at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('.hero-art img')).toBeVisible();
    expect(await page.locator('.hero-art img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await page.locator('.hero .button').first().click();
    await expect(page).toHaveURL(/#download$/);
    await expect(page.locator('#download .stores')).toBeInViewport();
    expect(await page.evaluate(()=>window.dataLayer.some(e=>e.action==='download_intent'))).toBe(true);
    await page.locator('summary').first().click();
    await expect(page.locator('details').first()).toHaveAttribute('open','');
    if(width<760){
      await page.getByRole('button',{name:'Menu',exact:true}).click();
      await expect(page.locator('#navigation')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button',{name:'Menu',exact:true})).toHaveAttribute('aria-expanded','false');
    }
    expect(errors).toEqual([]);
    if(width===390||width===1440){
      await page.goto('/');
      await page.locator('img').evaluateAll(imgs=>imgs.forEach(img=>img.loading='eager'));
      await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));
      await page.screenshot({path:`docs/home-${width}.png`,fullPage:true});
      if(width===390) await page.screenshot({path:'docs/home-mobile-first-screen.png'});
    }
  });
}
test('Guides and localized homes have usable assets and no page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  for(const url of ['/blog','/blog/restaurant-management-software','/blog/software-hosteleria-tpv','/blog/ar-restaurant-management-software','/fr','/es','/ar','/contact','/fr/contact','/es/contact','/ar/contact']){
    await page.goto(url);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),url).toBe(true);
    const broken=await page.locator('img[src]').evaluateAll(imgs=>imgs.filter(img=>img.getAttribute('src')&&img.loading!=='lazy'&&(!img.complete||!img.naturalWidth)).map(img=>img.src));
    expect(broken,url).toEqual([]);
  }
});
test('Localized contact forms submit once with translated confirmation',async({page})=>{
  for(const [lang,confirmation] of [['fr','Votre message'],['es','Tu mensaje'],['ar','تم إرسال']]){
    let count=0;
    await page.route('https://api.web3forms.com/submit',async route=>{count++;await route.fulfill({json:{success:true}});});
    await page.goto('/'+lang+'/contact');
    await page.locator('#name').fill('Test Restaurant');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#subject').selectOption({index:1});
    await page.locator('#message').fill('Testing the contact flow.');
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('status')).toContainText(confirmation);
    expect(count).toBe(1);
  }
});
test('Contact sends once and only confirms an explicit backend success',async({page})=>{
  let count=0;
  await page.route('https://api.web3forms.com/submit',async route=>{count++;await route.fulfill({json:{success:true}});});
  await page.goto('/contact');
  await page.getByLabel('Full Name').fill('Test Restaurant');
  await page.getByLabel('Email Address').fill('test@example.com');
  await page.getByLabel('Subject',{exact:true}).selectOption('Help choosing my setup');
  await page.getByLabel('Message',{exact:true}).fill('Can you help check our printer?');
  await page.getByRole('button',{name:/Send Message/i}).click();
  await expect(page.getByRole('status')).toContainText('Your message has been sent');
  expect(count).toBe(1);
  expect(await page.evaluate(()=>window.dataLayer.filter(e=>e.action==='contact_success').length)).toBe(1);
});
test('Contact preserves the message on backend errors and malformed success responses',async({page})=>{
  for(const reply of [{status:500,json:{success:false}},{status:200,json:{}}]){
    await page.route('https://api.web3forms.com/submit',route=>route.fulfill(reply));
    await page.goto('/contact');
    await page.getByLabel('Full Name').fill('Test Restaurant');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByLabel('Subject',{exact:true}).selectOption('General Question');
    await page.getByLabel('Message',{exact:true}).fill('Please keep this message.');
    await page.getByRole('button',{name:/Send Message/i}).click();
    await expect(page.getByRole('status')).toContainText('could not confirm');
    await expect(page.getByLabel('Message',{exact:true})).toHaveValue('Please keep this message.');
    await expect(page.getByRole('button',{name:/Send Message/i})).toBeEnabled();
  }
});
test('Homepage navigation, FAQs and store links work without JavaScript',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('#navigation')).toBeVisible();
  await page.locator('summary').first().click();
  await expect(page.locator('details').first()).toHaveAttribute('open','');
  await expect(page.locator('#download .store')).toHaveCount(3);
  await context.close();
});
