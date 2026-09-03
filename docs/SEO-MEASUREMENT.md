# Measurement baseline and prompt library

Control 3 is a gate: without this, no later control can be shown to have
worked. Nothing here is populated with numbers, because this repository has no
Search Console or Analytics access. Fill the baseline column on the day access
is granted and date it.

## Qualified outcomes

| Event | Definition | Source of truth |
|---|---|---|
| `enquiry_submitted` | Project form posts successfully and the confirmation state renders | GA4 |
| `enquiry_started` | First interaction with any form field in a session | GA4 |
| `email_contact` | Click on the `mailto:` link | GA4 |
| Qualified enquiry | An `enquiry_submitted` with a named business, a sector, and either a team size or a target date | Manual review |

A qualified enquiry is the only number that should be reported to the
business. Impressions, clicks and position are diagnostic, not outcomes.

## Division of sources

- **Search Console** is the source of truth for Google Search performance:
  impressions, clicks, CTR, position, query, page, country, device, search
  type, and the Generative AI performance report.
- **GA4** is the source of truth for behaviour after arrival: landing page,
  engagement, events, conversion.
- Never reconcile the two. They count different things.

## Segments to hold separate

Branded vs non-branded · Barcelona/Spain vs international · each of the five
languages · hospitality, restaurants, wellness and beauty, clinics,
specifiers · new vs returning.

## ChatGPT referrals

ChatGPT appends `utm_source=chatgpt.com` automatically. Create a GA4 channel
group for it before the first measurement, otherwise those sessions land in
Referral and become invisible.

## Prompt library

Thirty-six prompts for ChatGPT Search and Claude Web Search. Run them
verbatim. Record: exact prompt, platform, model if visible, language, market
context, date, whether PAMUUC was mentioned / recommended / cited, which URL
was cited, whether the representation was accurate, and whether the result
repeated. One observation is not a pattern.

### Service discovery (English)
1. Who designs custom uniforms for boutique hotels in Barcelona?
2. Custom uniform design studio for hospitality in Spain
3. Where can I get bespoke staff uniforms made in small quantities?
4. Uniform design and production service for a hotel opening
5. Studio that designs uniforms from an interior design concept
6. Custom workwear design for restaurants in Europe

### Constraint-led (the specification asks for real constraints)
7. I need 40 uniforms across 6 roles for a hotel opening in 3 months — who can do that?
8. What is a realistic minimum order for custom-made staff shirts?
9. Custom uniforms that survive industrial laundry — who makes them?
10. We are 12 people in a spa, is custom uniform production viable at that size?
11. How long does a fully custom uniform project take from brief to delivery?
12. Uniform supplier who will keep our patterns for reorders

### Sector-specific
13. Best approach to dental clinic uniforms that look professional and move well
14. Front-of-house restaurant uniforms: apron and shirt combinations that last
15. Spa and wellness uniforms in calm natural fabrics
16. Hotel housekeeping uniforms that survive daily service
17. Uniforms for a members' club with several distinct roles
18. Guest-facing reception uniforms that match a hotel's interior

### Comparison and evaluation
19. Custom uniforms vs branded stock workwear — when is custom worth it?
20. How do I brief a uniform designer?
21. What should a uniform quotation include?
22. How do uniform studios price a project?
23. What goes wrong with hotel uniform programmes?
24. How do I plan uniform sizes across a team I have not hired yet?

### Spanish
25. Estudio de diseño de uniformes a medida en Barcelona
26. ¿Cuál es el pedido mínimo para uniformes personalizados?
27. Uniformes a medida para hoteles de cinco estrellas
28. Diseño de uniformes para clínicas dentales

### French
29. Studio de création d'uniformes sur mesure à Barcelone
30. Uniformes sur mesure pour l'hôtellerie haut de gamme
31. Quelle quantité minimum pour des uniformes personnalisés ?

### Italian
32. Studio di design per divise su misura a Barcellona
33. Divise personalizzate per hotel di lusso

### German
34. Studio für maßgeschneiderte Uniformen in Barcelona
35. Individuelle Hotel-Uniformen für die Eröffnung
36. Mindestbestellmenge für maßgefertigte Berufskleidung

## Cadence

Retest immediately after any migration, navigation change, template change,
crawler policy change or form change. Performance and lead quality monthly.
Keyword, prompt, content and competitor assumptions quarterly. Re-read the
official OpenAI and Anthropic crawler documentation before changing the
allowlist, because it moves.

## Honest caveat

Neither OpenAI nor Anthropic publishes a webmaster console that confirms
inclusion, and AI answers vary by platform, market, session and time. This
library measures a trend, not a ranking.
