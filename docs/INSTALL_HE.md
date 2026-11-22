# מדריך התקנה – INFINITIX Smart Home 0.3.0

נבדק מול Home Assistant 2026.2.3 ו-2026.11.1 (ראה TEST_REPORT.md). אין צורך ב-Node.js, בטרמינל או ב-YAML.

## מה יש בקבצים
- `infinitix-smart-home-0.3.0.zip` – האינטגרציה עצמה. בתוכו התיקייה `custom_components/infinitix/`.
- התיקייה `infinitix-ha` המלאה (קוד, בדיקות, `hacs.json`) – נדרשת רק להתקנה דרך HACS.

## דרך א׳ – התקנה ידנית מה-ZIP (הכי פשוטה)

1. **גבה את HA** (Settings ← System ← Backups).
2. **הגע לתיקיית ההגדרות של HA** (התיקייה שבה נמצא `configuration.yaml`) באחת הדרכים:
   - **HA OS / Supervised:** התקן את התוסף **File editor** או **Studio Code Server**, או **Samba share** (אז התיקייה `config` מופיעה ברשת הביתית).
   - **Container / Core:** התיקייה שמופה ל-`/config` בקונטיינר.
3. **פתח את ה-ZIP לתוך התיקייה הזו** כך שייווצר הנתיב המדויק:
   `config/custom_components/infinitix/manifest.json`
   (אם אין תיקייה `custom_components`, צור אותה.) אם יצא נתיב כפול כמו `custom_components/custom_components/...` – הזז את התיקייה.
4. **הפעל מחדש את HA:** Settings ← System ← Restart (ולא רק Reload).
5. עבור ל**הפעלת האינטגרציה** למטה.

## דרך ב׳ – Marketplace של HA (בגרסה 2026.11 ואילך; מחליף את HACS)

בגרסה 2026.11 HACS הוטמע ב-HA בשם **Marketplace** (Settings ← Marketplace). אם כבר הייתה לך התקנת HACS, היא הועברה אוטומטית.
מאגר מותאם אישית חייב להיות **ציבורי** ב-GitHub: החיבור קורא רק מידע ציבורי ואינו מגיע למאגרים פרטיים.

1. העלה את הפרויקט למאגר GitHub ציבורי (ראה מדריך העלאה): `hacs.json` ו-`custom_components/` בשורש המאגר.
2. ערוך ב-`custom_components/infinitix/manifest.json` את `documentation` ואת `issue_tracker` לכתובת המאגר האמיתית.
3. ב-HA: **Settings ← Marketplace ← Add from link** והדבק את כתובת המאגר.
4. בפעם הראשונה: חיבור ל-GitHub (Device sign-in: HA מציג קוד ואתה מאשר באתר GitHub, בלי להקליד סיסמה ב-HA) ואישור הודעת הסיכון החד-פעמית.
5. פתח את הפרויקט תחת **Custom repositories** ← **Download**. לפי התיעוד, התקנה חדשה של אינטגרציה לא דורשת הפעלה מחדש; עדכונים כן דורשים. אם האינטגרציה לא מופיעה אחרי ההתקנה, הפעל מחדש את HA.

לא נבדק: ההתקנה דרך ה-Marketplace עצמו (נבדק רק ש-HA 2026.11.1 מתקין ומריץ את האינטגרציה כשהקבצים בתיקייה). ב-HA ישן מ-2026.11: HACS רגיל, **HACS ← ⋮ ← Custom repositories**, סוג Integration.

## הפעלת האינטגרציה (לשתי הדרכים)

1. **Settings ← Devices & services ← Add integration**.
2. חפש **INFINITIX Smart Home**, לחץ עליו ואשר.
3. בסרגל הצד יופיע **INFINITIX**. לחץ עליו – אשף ההגדרות נפתח אוטומטית (למנהל מערכת בלבד).
4. עבור על שבעת השלבים: ברוכים הבאים ← אופן הגדרה ← סריקה ← חדרים ← התקנים ← התאמה ← תצוגה מקדימה וסיום.

## אימות שההתקנה הצליחה
- האינטגרציה מופיעה תחת Devices & services.
- ב-**Settings ← System ← Logs** אין שגיאות מהמילה `infinitix`. אזהרה אחת על "custom integration which has not been tested by Home Assistant" היא תקינה.
- אחרי הפעלה מחדש של HA, האשף אינו חוזר והדאשבורד נשאר כפי ששמרת.

## עדכון
- ידני: החלף את התיקייה `custom_components/infinitix` בגרסה החדשה והפעל מחדש את HA. ההגדרות שלך נשמרות בנפרד (`.storage/infinitix.config`) ולא נמחקות.
- Marketplace/HACS: Update ואחר כך Restart (עדכונים דורשים הפעלה מחדש).

## הסרה
Settings ← Devices & services ← INFINITIX ← ⋮ ← Delete. ההגדרות השמורות נמחקות. אפשר אז למחוק גם את `custom_components/infinitix`.

## פתרון בעיות
| תסמין | מה לבדוק |
|---|---|
| INFINITIX לא מופיע ברשימת האינטגרציות | הנתיב המדויק `custom_components/infinitix/manifest.json`, וביצעת Restart מלא |
| INFINITIX לא מופיע בסרגל הצד | Settings ← Devices & services ← INFINITIX ← Configure ← "Show in sidebar" |
| הדאשבורד נטען אך ריק או נתקע | רענון קשיח בדפדפן (Ctrl+Shift+R) ובדיקת Logs |
| רואה "אין הרשאה" | הגדרות, סריקה וייבוא/ייצוא זמינים רק למשתמש מנהל |
| האינטגרציה לא נטענת אחרי שדרוג | יש לוג על גרסת אחסון חדשה מהמוכרת: התקנת גרסה ישנה על נתונים חדשים נחסמת בכוונה |

## התקנה בבית לקוח נוסף
1. התקן כאן, והפעל את האינטגרציה.
2. בבית המקור: הגדרות ← ייצוא (קובץ בלי סודות או טוקנים).
3. בבית החדש: הגדרות ← ייבוא, והתאם מחדש חדרים וישויות באשף המיפוי.
