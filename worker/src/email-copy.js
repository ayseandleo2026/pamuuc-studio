/* ============================================================================
   What the customer is told, in their language
   ---------------------------------------------------------------------------
   The two customer-facing emails — the confirmation and the first order
   discount — are the only ones translated. The studio notification stays in
   English: it is read by PAMUUC staff, and a request that arrives in Italian
   is harder to work from, not easier.

   Keyed by locale, then by the same short names the templates use. `f.locale`
   arrives on the payload and holds 'en' | 'es' | 'fr' | 'it' | 'de'; anything
   else, or nothing at all, reads as English. `copyFor()` lays the locale over
   English key by key, so a key that is missing from a language falls back on
   its own rather than dropping the whole language back to English — the same
   rule content/merch.<loc>.json follows.

   Register is formal throughout — usted, vous, Lei, Sie — because the rest of
   the site is, and the two halves have to sound like one company. The
   vocabulary is the merchandise dictionary's: quote is presupuesto / devis /
   preventivo / Angebot, artwork is arte / fichier / file grafico / Druckdaten,
   personalisation is personalización / personnalisation / personalizzazione /
   Veredelung, placement is colocación / placement / posizionamento /
   Platzierung. See TRANSLATION.md.

   Never translated, here as everywhere: the brand (PAMUUC), the legal entity
   (Pamuk Studio S.L), product references, DTF/DTG and fabric weights.
   ========================================================================= */

export const EMAIL_COPY = {

  /* ---- en: the source. Editing a value here changes what the email says. -- */
  en: {
    dateLocale: 'en-GB',
    atTime: 'at',
    merchPath: '/merchandise/',

    /* the confirmation */
    headQuote: 'We have your request.',
    headEnquiry: 'We have your enquiry.',
    nextQuote: 'We price it by hand and come back to you, usually within two working days. Nothing is ordered and nothing is charged until you approve the quote.',
    nextEnquiry: 'One of us reads it properly and comes back to you, usually within two working days.',
    subjectQuote: 'we have your request',
    subjectEnquiry: 'we have your enquiry',
    eyebrowMerch: 'Merchandise',
    eyebrowUniforms: 'Custom uniforms',
    yourReference: 'Your reference',
    referenceLine: 'Your reference is {ref}.',
    askedFor: 'What you asked for',
    toldUs: 'What you told us',
    callProposed: 'The call you proposed',
    confirmTime: 'We confirm the time when we reply.',
    lProduct: 'Product',
    lColour: 'Colour',
    lFit: 'Fit',
    lQuantity: 'Quantity',
    pieces: 'pieces',
    lPersonalisation: 'Personalisation',
    lPlacement: 'Placement',
    lArtwork: 'Your artwork',
    received: 'received',
    lLookingFor: 'Looking for',
    lTeamSize: 'Team size',
    lTimeline: 'Timeline',
    firstOrderHtml: 'Your first order discount is on this request. There is no code to quote — we apply it when we price the quote, before you approve it.',
    firstOrderText: 'Your first order discount is on this request. There is no code to quote — we apply it when we price the quote.',
    ifWrong: 'If anything above is wrong, reply to this email — it reaches the person handling it.',

    /* the first order discount */
    offerHead: 'Your first order discount is set up.',
    offerSubject: 'Your first order discount is set up',
    offerTitle: 'Your first order discount',
    offerEyebrow: 'First order',
    offerIntro: 'There is nothing to remember and no code to quote. Send us a request and we apply the discount when we price it, before you approve anything. The rate follows the quantity.',
    offerIntroText: 'There is nothing to remember and no code to quote. Send us a request and we apply the discount when we price it, before you approve anything.',
    offerCta: 'Start choosing',
    offerSmall: 'One discount per account, on the first order. Nothing is charged when you request a quote — a person prices it and you decide.',
    offerSmallText: 'One discount per account, on the first order. Nothing is charged when you request a quote.',
    offerPreheader: 'Up to {pct}% off your first order, by quantity.',
    offerFootNote: 'You are getting this because you asked about the first order discount on pamuuc-studio.com. ',
    unsubscribe: 'Unsubscribe',
    /* The bands the studio quotes at. Keyed on the English label, so a band
       configured through OFFER_TIERS translates too when it matches one of
       these and passes through unchanged when it does not. */
    tierSay: {
      'Under 100 pieces': 'Under 100 pieces',
      '100 to 499 pieces': '100 to 499 pieces',
      '500 pieces and over': '500 pieces and over',
    },
  },

  /* ---- es ---------------------------------------------------------------- */
  es: {
    dateLocale: 'es-ES',
    atTime: 'a las',
    merchPath: '/es/merchandise/',

    headQuote: 'Tenemos su solicitud de presupuesto.',
    headEnquiry: 'Tenemos su consulta.',
    nextQuote: 'Lo presupuestamos a mano y le respondemos, normalmente en dos días laborables. No se pide nada ni se cobra nada hasta que usted apruebe el presupuesto.',
    nextEnquiry: 'Una persona la lee con atención y le responde, normalmente en dos días laborables.',
    subjectQuote: 'tenemos su solicitud de presupuesto',
    subjectEnquiry: 'tenemos su consulta',
    eyebrowMerch: 'Merchandising',
    eyebrowUniforms: 'Uniformes a medida',
    yourReference: 'Su referencia',
    referenceLine: 'Su referencia es {ref}.',
    askedFor: 'Lo que ha pedido',
    toldUs: 'Lo que nos ha contado',
    callProposed: 'La llamada que ha propuesto',
    confirmTime: 'Confirmamos la hora en nuestra respuesta.',
    lProduct: 'Producto',
    lColour: 'Color',
    lFit: 'Corte',
    lQuantity: 'Cantidad',
    pieces: 'unidades',
    lPersonalisation: 'Personalización',
    lPlacement: 'Colocación',
    lArtwork: 'Su arte',
    received: 'recibido',
    lLookingFor: 'Busca',
    lTeamSize: 'Tamaño del equipo',
    lTimeline: 'Plazos',
    firstOrderHtml: 'El descuento de su primer pedido está aplicado a esta solicitud. No hay ningún código que indicar: lo aplicamos al calcular el presupuesto, antes de que usted lo apruebe.',
    firstOrderText: 'El descuento de su primer pedido está aplicado a esta solicitud. No hay ningún código que indicar: lo aplicamos al calcular el presupuesto.',
    ifWrong: 'Si algo de lo anterior no es correcto, responda a este email: llega a la persona que lo está gestionando.',

    offerHead: 'El descuento de su primer pedido está listo.',
    offerSubject: 'El descuento de su primer pedido está listo',
    offerTitle: 'El descuento de su primer pedido',
    offerEyebrow: 'Primer pedido',
    offerIntro: 'No hay nada que recordar ni ningún código que indicar. Envíenos una solicitud y aplicamos el descuento al calcular el presupuesto, antes de que apruebe nada. El porcentaje depende de la cantidad.',
    offerIntroText: 'No hay nada que recordar ni ningún código que indicar. Envíenos una solicitud y aplicamos el descuento al calcular el presupuesto, antes de que apruebe nada.',
    offerCta: 'Empezar a elegir',
    offerSmall: 'Un descuento por cuenta, en el primer pedido. No se cobra nada al solicitar un presupuesto: lo calcula una persona y usted decide.',
    offerSmallText: 'Un descuento por cuenta, en el primer pedido. No se cobra nada al solicitar un presupuesto.',
    offerPreheader: 'Hasta un {pct}% en su primer pedido, según la cantidad.',
    offerFootNote: 'Recibe este mensaje porque preguntó por el descuento de primer pedido en pamuuc-studio.com. ',
    unsubscribe: 'Darse de baja',
    tierSay: {
      'Under 100 pieces': 'Menos de 100 unidades',
      '100 to 499 pieces': 'De 100 a 499 unidades',
      '500 pieces and over': 'Desde 500 unidades',
    },
  },

  /* ---- fr ---------------------------------------------------------------- */
  fr: {
    dateLocale: 'fr-FR',
    atTime: 'à',
    merchPath: '/fr/merchandise/',

    headQuote: 'Nous avons votre demande de devis.',
    headEnquiry: 'Nous avons votre demande.',
    nextQuote: 'Nous le chiffrons à la main et revenons vers vous, généralement sous deux jours ouvrés. Rien n’est commandé et rien n’est facturé tant que vous n’avez pas validé le devis.',
    nextEnquiry: 'Une personne la lit attentivement et revient vers vous, généralement sous deux jours ouvrés.',
    subjectQuote: 'nous avons votre demande de devis',
    subjectEnquiry: 'nous avons votre demande',
    eyebrowMerch: 'Merchandising',
    eyebrowUniforms: 'Uniformes sur mesure',
    yourReference: 'Votre référence',
    referenceLine: 'Votre référence est {ref}.',
    askedFor: 'Ce que vous avez demandé',
    toldUs: 'Ce que vous nous avez indiqué',
    callProposed: 'L’appel que vous avez proposé',
    confirmTime: 'Nous confirmons l’horaire dans notre réponse.',
    lProduct: 'Produit',
    lColour: 'Coloris',
    lFit: 'Coupe',
    lQuantity: 'Quantité',
    pieces: 'pièces',
    lPersonalisation: 'Personnalisation',
    lPlacement: 'Placement',
    lArtwork: 'Votre fichier',
    received: 'reçu',
    lLookingFor: 'Recherche',
    lTeamSize: 'Taille de l’équipe',
    lTimeline: 'Délais',
    firstOrderHtml: 'Votre remise de première commande est appliquée à cette demande. Il n’y a aucun code à indiquer : nous l’appliquons au moment de chiffrer le devis, avant votre validation.',
    firstOrderText: 'Votre remise de première commande est appliquée à cette demande. Il n’y a aucun code à indiquer : nous l’appliquons au moment de chiffrer le devis.',
    ifWrong: 'Si quelque chose ci-dessus est incorrect, répondez à cet e-mail : il arrive à la personne qui s’en occupe.',

    offerHead: 'Votre remise de première commande est activée.',
    offerSubject: 'Votre remise de première commande est activée',
    offerTitle: 'Votre remise de première commande',
    offerEyebrow: 'Première commande',
    offerIntro: 'Il n’y a rien à retenir et aucun code à indiquer. Envoyez-nous une demande et nous appliquons la remise au moment de chiffrer le devis, avant toute validation. Le taux suit la quantité.',
    offerIntroText: 'Il n’y a rien à retenir et aucun code à indiquer. Envoyez-nous une demande et nous appliquons la remise au moment de chiffrer le devis, avant toute validation.',
    offerCta: 'Commencer à choisir',
    offerSmall: 'Une remise par compte, sur la première commande. Aucun paiement à la demande de devis : une personne le chiffre et vous décidez.',
    offerSmallText: 'Une remise par compte, sur la première commande. Aucun paiement à la demande de devis.',
    offerPreheader: 'Jusqu’à {pct} % sur votre première commande, selon la quantité.',
    offerFootNote: 'Vous recevez ce message parce que vous vous êtes renseigné sur la remise de première commande sur pamuuc-studio.com. ',
    unsubscribe: 'Se désabonner',
    tierSay: {
      'Under 100 pieces': 'Moins de 100 pièces',
      '100 to 499 pieces': 'De 100 à 499 pièces',
      '500 pieces and over': '500 pièces et plus',
    },
  },

  /* ---- it ---------------------------------------------------------------- */
  it: {
    dateLocale: 'it-IT',
    atTime: 'alle',
    merchPath: '/it/merchandise/',

    headQuote: 'Abbiamo la sua richiesta di preventivo.',
    headEnquiry: 'Abbiamo la sua richiesta.',
    nextQuote: 'Lo calcoliamo a mano e le rispondiamo, di solito entro due giorni lavorativi. Non viene ordinato né addebitato nulla finché non approva il preventivo.',
    nextEnquiry: 'Una persona la legge con attenzione e le risponde, di solito entro due giorni lavorativi.',
    subjectQuote: 'abbiamo la sua richiesta di preventivo',
    subjectEnquiry: 'abbiamo la sua richiesta',
    eyebrowMerch: 'Merchandising',
    eyebrowUniforms: 'Divise su misura',
    yourReference: 'Il suo riferimento',
    referenceLine: 'Il suo riferimento è {ref}.',
    askedFor: 'Ciò che ha richiesto',
    toldUs: 'Ciò che ci ha indicato',
    callProposed: 'La chiamata che ha proposto',
    confirmTime: 'Confermiamo l’orario nella nostra risposta.',
    lProduct: 'Prodotto',
    lColour: 'Colore',
    lFit: 'Vestibilità',
    lQuantity: 'Quantità',
    pieces: 'pezzi',
    lPersonalisation: 'Personalizzazione',
    lPlacement: 'Posizionamento',
    lArtwork: 'Il suo file grafico',
    received: 'ricevuto',
    lLookingFor: 'Cerca',
    lTeamSize: 'Dimensione del team',
    lTimeline: 'Tempi',
    firstOrderHtml: 'Lo sconto sul primo ordine è applicato a questa richiesta. Non c’è alcun codice da indicare: lo applichiamo quando calcoliamo il preventivo, prima della sua approvazione.',
    firstOrderText: 'Lo sconto sul primo ordine è applicato a questa richiesta. Non c’è alcun codice da indicare: lo applichiamo quando calcoliamo il preventivo.',
    ifWrong: 'Se qualcosa qui sopra non è corretto, risponda a questa email: arriva alla persona che se ne occupa.',

    offerHead: 'Lo sconto sul primo ordine è attivo.',
    offerSubject: 'Lo sconto sul primo ordine è attivo',
    offerTitle: 'Lo sconto sul primo ordine',
    offerEyebrow: 'Primo ordine',
    offerIntro: 'Non c’è nulla da ricordare né alcun codice da indicare. Ci invii una richiesta e applichiamo lo sconto quando calcoliamo il preventivo, prima di qualsiasi approvazione. La percentuale dipende dalla quantità.',
    offerIntroText: 'Non c’è nulla da ricordare né alcun codice da indicare. Ci invii una richiesta e applichiamo lo sconto quando calcoliamo il preventivo, prima di qualsiasi approvazione.',
    offerCta: 'Inizi a scegliere',
    offerSmall: 'Uno sconto per account, sul primo ordine. Nessun pagamento alla richiesta di preventivo: lo calcola una persona e lei decide.',
    offerSmallText: 'Uno sconto per account, sul primo ordine. Nessun pagamento alla richiesta di preventivo.',
    offerPreheader: 'Fino al {pct}% sul primo ordine, in base alla quantità.',
    offerFootNote: 'Riceve questo messaggio perché ha chiesto informazioni sullo sconto per il primo ordine su pamuuc-studio.com. ',
    unsubscribe: 'Annullare l’iscrizione',
    tierSay: {
      'Under 100 pieces': 'Meno di 100 pezzi',
      '100 to 499 pieces': 'Da 100 a 499 pezzi',
      '500 pieces and over': 'Da 500 pezzi',
    },
  },

  /* ---- de ---------------------------------------------------------------- */
  de: {
    dateLocale: 'de-DE',
    atTime: 'um',
    merchPath: '/de/merchandise/',

    headQuote: 'Wir haben Ihre Angebotsanfrage.',
    headEnquiry: 'Wir haben Ihre Anfrage.',
    nextQuote: 'Wir kalkulieren sie von Hand und melden uns, in der Regel innerhalb von zwei Werktagen. Es wird nichts bestellt und nichts berechnet, bevor Sie das Angebot freigeben.',
    nextEnquiry: 'Eine Person liest sie in Ruhe und meldet sich, in der Regel innerhalb von zwei Werktagen.',
    subjectQuote: 'wir haben Ihre Angebotsanfrage',
    subjectEnquiry: 'wir haben Ihre Anfrage',
    eyebrowMerch: 'Merchandise',
    eyebrowUniforms: 'Individuelle Berufskleidung',
    yourReference: 'Ihre Referenz',
    referenceLine: 'Ihre Referenz lautet {ref}.',
    askedFor: 'Was Sie angefragt haben',
    toldUs: 'Was Sie uns mitgeteilt haben',
    callProposed: 'Das von Ihnen vorgeschlagene Gespräch',
    confirmTime: 'Die Uhrzeit bestätigen wir in unserer Antwort.',
    lProduct: 'Produkt',
    lColour: 'Farbe',
    lFit: 'Schnitt',
    lQuantity: 'Menge',
    pieces: 'Stück',
    lPersonalisation: 'Veredelung',
    lPlacement: 'Platzierung',
    lArtwork: 'Ihre Druckdaten',
    received: 'erhalten',
    lLookingFor: 'Gesucht',
    lTeamSize: 'Teamgröße',
    lTimeline: 'Zeitrahmen',
    firstOrderHtml: 'Ihr Rabatt für die erste Bestellung ist in dieser Anfrage berücksichtigt. Es gibt keinen Code anzugeben — wir ziehen ihn ab, wenn wir das Angebot kalkulieren, bevor Sie es freigeben.',
    firstOrderText: 'Ihr Rabatt für die erste Bestellung ist in dieser Anfrage berücksichtigt. Es gibt keinen Code anzugeben — wir ziehen ihn ab, wenn wir das Angebot kalkulieren.',
    ifWrong: 'Sollte oben etwas nicht stimmen, antworten Sie einfach auf diese E-Mail — sie erreicht die Person, die sich darum kümmert.',

    offerHead: 'Ihr Rabatt für die erste Bestellung ist aktiviert.',
    offerSubject: 'Ihr Rabatt für die erste Bestellung ist aktiviert',
    offerTitle: 'Ihr Rabatt für die erste Bestellung',
    offerEyebrow: 'Erste Bestellung',
    offerIntro: 'Es gibt nichts zu merken und keinen Code anzugeben. Senden Sie uns eine Anfrage, und wir ziehen den Rabatt ab, wenn wir sie kalkulieren, bevor Sie irgendetwas freigeben. Der Satz richtet sich nach der Menge.',
    offerIntroText: 'Es gibt nichts zu merken und keinen Code anzugeben. Senden Sie uns eine Anfrage, und wir ziehen den Rabatt ab, wenn wir sie kalkulieren, bevor Sie irgendetwas freigeben.',
    offerCta: 'Jetzt auswählen',
    offerSmall: 'Ein Rabatt pro Konto, auf die erste Bestellung. Bei einer Angebotsanfrage wird nichts berechnet — eine Person kalkuliert, und Sie entscheiden.',
    offerSmallText: 'Ein Rabatt pro Konto, auf die erste Bestellung. Bei einer Angebotsanfrage wird nichts berechnet.',
    offerPreheader: 'Bis zu {pct} % auf Ihre erste Bestellung, je nach Menge.',
    offerFootNote: 'Sie erhalten diese Nachricht, weil Sie sich auf pamuuc-studio.com nach dem Rabatt für die erste Bestellung erkundigt haben. ',
    unsubscribe: 'Abmelden',
    tierSay: {
      'Under 100 pieces': 'Unter 100 Stück',
      '100 to 499 pieces': '100 bis 499 Stück',
      '500 pieces and over': 'Ab 500 Stück',
    },
  },
};

/* The language a message is written in. Anything unknown is English, and a key
   a language has not filled in is English too — one missing string, not one
   English email. */
export function copyFor(locale) {
  const key = String(locale || 'en').trim().slice(0, 2).toLowerCase();
  return { ...EMAIL_COPY.en, ...(EMAIL_COPY[key] || {}) };
}

/* The <html lang> the mail carries, which is what a screen reader announces
   and what a client uses to decide whether to offer a translation. */
export function langOf(locale) {
  const key = String(locale || 'en').trim().slice(0, 2).toLowerCase();
  return EMAIL_COPY[key] ? key : 'en';
}
