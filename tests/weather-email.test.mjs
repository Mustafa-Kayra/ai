import assert from "node:assert/strict";
import {
  buildWeatherUrl,
  formatWeatherEmail,
} from "../agents/weather-email/index.mjs";

// Deterministic wttr.in (?format=j1&lang=tr) fixture so the test does not
// depend on network availability. Mirrors the shape the agent consumes.
const weatherFixture = {
  current_condition: [
    {
      temp_C: "21",
      FeelsLikeC: "20",
      humidity: "55",
      windspeedKmph: "15",
      visibility: "10",
      uvIndex: "4",
      pressure: "1015",
      precipMM: "0.0",
      weatherCode: "116",
      weatherDesc: [{ value: "Partly cloudy" }],
      lang_tr: [{ value: "Parçalı bulutlu" }],
    },
  ],
  weather: [
    {
      mintempC: "15",
      maxtempC: "22",
      hourly: [
        { time: "0", tempC: "15", weatherDesc: [{ value: "Clear" }], lang_tr: [{ value: "Açık" }] },
        { time: "300", tempC: "14", weatherDesc: [{ value: "Clear" }], lang_tr: [{ value: "Açık" }] },
        { time: "600", tempC: "16", weatherDesc: [{ value: "Sunny" }], lang_tr: [{ value: "Güneşli" }] },
        { time: "900", tempC: "19", weatherDesc: [{ value: "Sunny" }], lang_tr: [{ value: "Güneşli" }] },
        { time: "1200", tempC: "22", weatherDesc: [{ value: "Partly cloudy" }], lang_tr: [{ value: "Parçalı bulutlu" }] },
        { time: "1500", tempC: "21", weatherDesc: [{ value: "Partly cloudy" }], lang_tr: [{ value: "Parçalı bulutlu" }] },
        { time: "1800", tempC: "18", weatherDesc: [{ value: "Cloudy" }], lang_tr: [{ value: "Bulutlu" }] },
        { time: "2100", tempC: "16", weatherDesc: [{ value: "Cloudy" }], lang_tr: [{ value: "Bulutlu" }] },
      ],
    },
    {
      mintempC: "13",
      maxtempC: "20",
      hourly: [
        { time: "1200", tempC: "20", weatherDesc: [{ value: "Sunny" }], lang_tr: [{ value: "Güneşli" }] },
      ],
    },
  ],
};

await run("buildWeatherUrl requests Turkish language from wttr.in", () => {
  const url = buildWeatherUrl("Istanbul");
  assert.ok(url.includes("format=j1"), "url should use the j1 JSON format");
  assert.ok(url.includes("lang=tr"), "url must include lang=tr for Turkish descriptions");
  assert.ok(url.startsWith("https://wttr.in/"), "url should target wttr.in over https");
  assert.ok(url.includes(encodeURIComponent("Istanbul")), "city should be url-encoded");
});

await run("email HTML uses Turkish current description", () => {
  const { html } = formatWeatherEmail(weatherFixture, "Istanbul");
  assert.ok(html.includes("Parçalı bulutlu"), "HTML should show the Turkish current description");
  assert.ok(!html.includes(">Sunny<"), "HTML should not leak the English current description as the main desc");
  assert.ok(html.includes("21°C"), "HTML should show the current temperature");
  assert.ok(html.includes("Istanbul"), "HTML should show the city name");
});

await run("email plain-text body uses Turkish current description", () => {
  const { text } = formatWeatherEmail(weatherFixture, "Istanbul");
  assert.ok(text.includes("Parçalı bulutlu"), "text body should show the Turkish current description");
  assert.ok(!text.includes("Partly cloudy"), "text body should not leak the English description");
  assert.ok(text.includes("21°C"), "text body should show the current temperature");
});

await run("hourly forecast maps to morning/noon/evening with correct temps", () => {
  const { html } = formatWeatherEmail(weatherFixture, "Istanbul");
  // morning = hourly[3] (09:00) -> 19°, Güneşli
  assert.ok(html.includes("Sabah"), "should render the morning row");
  assert.ok(html.includes("19°"), "should show the 09:00 morning temperature");
  assert.ok(html.includes("Güneşli"), "should show the Turkish morning description");
  // noon = hourly[4] (12:00) -> 22°
  assert.ok(html.includes("Öğle"), "should render the noon row");
  assert.ok(html.includes("22°"), "should show the 12:00 noon temperature");
  // evening = hourly[6] (18:00) -> 18°, Bulutlu
  assert.ok(html.includes("Akşam"), "should render the evening row");
  assert.ok(html.includes("18°"), "should show the 18:00 evening temperature");
  assert.ok(html.includes("Bulutlu"), "should show the Turkish evening description");
});

await run("email includes tomorrow min/max forecast", () => {
  const { html, text } = formatWeatherEmail(weatherFixture, "Istanbul");
  assert.ok(html.includes("Yarın"), "HTML should render the tomorrow row");
  assert.ok(html.includes("13° / 20°"), "HTML should show tomorrow min/max");
  assert.ok(text.includes("Yarın: 13°C - 20°C"), "text body should show tomorrow min/max");
});

await run("formatWeatherEmail falls back to English when lang_tr is missing", () => {
  const fixture = JSON.parse(JSON.stringify(weatherFixture));
  delete fixture.current_condition[0].lang_tr;
  for (const h of fixture.weather[0].hourly) delete h.lang_tr;
  const { html, text } = formatWeatherEmail(fixture, "Istanbul");
  assert.ok(html.includes("Partly cloudy"), "HTML should fall back to English description");
  assert.ok(text.includes("Partly cloudy"), "text body should fall back to English description");
});

async function run(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}
