# Strategic Decision Contract v1.0

این Slice قرارداد تصمیم Workbench را از «فهرست چند Action» به یک Decision Brief
قابل توضیح ارتقا می‌دهد. ترتیب تصمیم صریح است:

`Why → What Action → For Whom → When → Format`

Platform در این مرحله انتخاب نمی‌شود. Action محتوایی فقط `mother_concept` است و پس
از انتخاب انسانی وارد Claim، Voice، Authenticity، Platform Adaptation و Risk Gate
می‌شود.

## Attention Budget

Feasibility پنج منبع محدود را جداگانه بررسی می‌کند:

- زمان در دسترس؛
- Energy؛
- Attention/Focus مستقل از زمان؛
- Visibility Tolerance؛
- Emotional Bandwidth.

هر Option هزینه متناظر خود را دارد. عبور از هر سقف، دلیل typed و قابل مشاهده تولید
می‌کند و Option را `infeasible` نگه می‌دارد. Utility Score و Opportunity Cost با
Ranking Policy اعلام‌شده محاسبه و هر دو در UI نمایش داده می‌شوند؛ Score پنهان وجود
ندارد. ده Action متوسط جای یک Action با Utility بالاتر را نمی‌گیرد.

## قرارداد هر Action

هر Action شامل Objective، Stakeholder، Posture زمانی، پنجره ۲۴ساعته تصمیم، Format
مستقل از Platform، Assumption، Uncertainty، Feasibility Reason، Human Approval و
Measurement Plan است. Measurement فقط Like/View نیست و بسته به Action می‌تواند عمق
تعامل، تغییر رابطه، Opportunity، Perception Shift، رضایت، پشیمانی و انرژی کاربر را
در بر بگیرد.

Recommendation مساوی Execution نیست. همه خروجی‌ها مرزهای زیر را حفظ می‌کنند:

- `requiredApproval=human`؛
- `recommendationIsExecution=false`؛
- `publicApprovalGranted=false`؛
- `externalActionPermitted=false`.

## Cold Start و Expiry

نبود Evidence مجاز، Action بیرونی جعلی یا Urgency ساختگی تولید نمی‌کند. مسیرهای جمع‌آوری
Evidence با Posture برابر `when_ready` نمایش داده می‌شوند و عدم اقدام یک گزینه معتبر
باقی می‌ماند. Decision Brief پس از ۲۴ ساعت منقضی است و باید با Strategy، Evidence و
Context تازه دوباره ساخته شود. هر Brief و Action به Strategy revision، Decision Context
revision و Context hash متصل است؛ Client قدیمی یا Approval منقضی به‌صورت fail-closed رد
می‌شود. جزئیات Persistence، RLS و Race Safety در
[Decision Context v1.0](decision-context-v1.0.md) ثبت شده است.
