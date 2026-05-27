import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const BASE_URL = "https://pamuuc-studio.com";
const LASTMOD = "2026-05-27";
const FORM_ENDPOINT = "https://formspree.io/f/mlgpvble";
const FAVICON_URL = "https://cdn.shopify.com/s/files/1/0577/3688/8485/files/Icon_Logo_Red.png?v=1772224283";
const GA4_ID = "G-HS8HYY7LV1";

const TEAM_PHOTOS = {
  "Leonardo Gobbato": "team-leonardo",
  "Federica Vianson Cocco": "team-federica",
  "Andreas Gonzalez": "team-andreas",
};

const languageOrder = ["en", "fr", "it", "es", "de"];

const languages = {
  en: {
    code: "en",
    label: "EN",
    htmlLang: "en",
    locale: "en_US",
    name: "English",
    homePath: "/",
    blogPath: "/en/blog/",
    legalPath: "/legal/",
    nav: { offer: "Offer", sectors: "Sectors", process: "Process", proof: "Proof", blog: "Blog", contact: "Contact" },
    skip: "Skip to content",
    footer: {
      line: "Custom uniform systems developed in Barcelona.",
      studio: "Studio",
      legal: "Legal",
      pamuuc: "PAMUUC.COM"
    },
    cookie: {
      text: "We use analytics cookies to understand how visitors use this site. You can accept or decline.",
      accept: "Accept",
      reject: "Decline"
    },
    home: {
      title: "Pamuuc Studio | Custom uniform systems for hospitality, healthcare, wellness, and service teams",
      description: "Pamuuc Studio designs durable bespoke uniform systems for hospitality, healthcare, wellness, and service teams, with Barcelona-led development and reliable repeat orders.",
      eyebrow: "Barcelona — design and production studio",
      h1: "Custom uniform systems for hospitality, healthcare, wellness and service teams",
      statement: "For teams where what people wear is part of how the work is judged.",
      lead: "We design, develop, and coordinate complete uniform systems around the physical reality of your space — built to last, built to wash, and built to reorder without renegotiation.",
      primaryCta: "Request a first meeting",
      secondaryCta: "Read the studio cases",
      proof: ["Barcelona-led development", "Built for frequent washing", "Role-based wardrobe systems", "Reliable repeat orders"],
      introTitle: "Clothing that holds up to real work",
      introText: "The best uniform system is nearly invisible to the guest — present without drawing attention to itself. It holds its shape through daily washing, reads clearly across roles, and stays consistent as the team grows and the space evolves.",
      offerTitle: "What we do",
      offerLead: "A focused studio. We design garments, develop them for production, and manage the continuity of reorders.",
      offers: [
        ["Custom uniform design", "Garments designed around the physical demands of the role — fit, movement, comfort in temperature, and visual clarity across positions."],
        ["Technical product development", "Every technical decision — fabric weight, construction method, branding, care requirement — is made for the actual conditions of the work."],
        ["Production continuity", "Validated patterns and full specifications stay on file. When you need to reorder, the result matches the original."]
      ],
      sectorsTitle: "Who it is for",
      sectorsLead: "We work with operations where the quality of the uniform is part of the quality of the experience — hotels, clinics, wellness studios, food and beverage, and broader service teams.",
      sectors: ["Hospitality", "Food and beverage", "Wellness", "Healthcare and clinics", "Guest services", "Service teams"],
      processTitle: "A clear path from idea to delivery",
      processLead: "No surprises before production. Every stage is defined before the next begins.",
      steps: [
        ["01", "Discover", "We understand the space, the roles, the daily physical reality, and the visual direction you want to hold."],
        ["02", "Develop", "We define the garments — silhouette, fabric, construction, branding details — and develop samples for approval."],
        ["03", "Produce", "Approved garments move into production. We coordinate the full process and manage delivery."],
        ["04", "Continue", "Every specification stays on file. Future reorders arrive consistent with the original."]
      ],
      productionTitle: "Honest about the numbers",
      productionLead: "We size and scope every project before development begins. No surprises on timeline or investment.",
      facts: [
        ["From 5 pieces per style", "Small runs can be assessed when construction allows it."],
        ["4-6 weeks", "Typical development window for bespoke garments."],
        ["3-5 weeks", "Typical production window after approval."],
        ["Proposal-based pricing", "No rigid catalogue pricing; each project is estimated around actual needs."]
      ],
      editorialTitle: "Cases and notes",
      editorialLead: "Case notes from hospitality, healthcare, and wellness projects.",
      teamTitle: "Who you will work with",
      teamLead: "Every project is handled by the same small group of people. No account managers, no handoffs.",
      team: [
        ["Leonardo Gobbato", "Founder and Head of Product Operations", "Leads product development: silhouette decisions, fabric selection, construction logic, and production specifications."],
        ["Federica Vianson Cocco", "Co-founder and Head of Business Development", "Manages client relationships and project flow from first conversation to final delivery."],
        ["Andreas Gonzalez", "Co-founder and CEO", "Brings operational hospitality experience to every design decision — what a uniform actually needs to do in service."]
      ],
      faqTitle: "Before we begin",
      faq: [
        ["Do you work from a catalogue?", "No. We can use proven bases when they help timing or budget, but every project is shaped around your team, space, and operational reality."],
        ["Can we start with one role or garment?", "Yes. Many projects begin with one department or garment type and expand once the direction is validated."],
        ["Do you handle repeat orders?", "Yes. Approved patterns, fabrics, finishes, and specifications are archived. When you come back, the result matches."],
        ["Do you work outside Barcelona?", "Yes. Development is led from Barcelona, with meetings in person or by video depending on the project and location."]
      ],
      contactTitle: "Tell us about your project",
      contactLead: "Describe your team, environment, and timing. We will reply within one working day with our initial read.",
      emailCta: "Prefer email",
      form: {
        hint: "Completing the form takes around 2 minutes. We usually reply within 1 working day.",
        name: "Full name",
        email: "Business email",
        phone: "Phone number",
        company: "Company name",
        team: "Team size",
        type: "Project type",
        timeline: "Target timeline",
        brief: "Project description",
        consent: "I accept the privacy, cookie, terms, and legal information.",
        submit: "Send project request",
        sending: "Sending your request...",
        success: "Your request was sent. We usually reply within 1 working day.",
        error: "We could not send your request right now. Please try again or use email."
      }
    },
    blogTitle: "Pamuuc Studio Blog",
    blogDescription: "Practical articles on how to design, implement, and maintain coherent uniform systems for real teams.",
    legalTitle: "Legal information",
    legalDescription: "Privacy, cookie, terms, and legal information for Pamuuc Studio."
  },
  fr: {
    code: "fr",
    label: "FR",
    htmlLang: "fr",
    locale: "fr_FR",
    name: "Français",
    homePath: "/fr/",
    blogPath: "/fr/blog/",
    legalPath: "/fr/legal/",
    nav: { offer: "Offre", sectors: "Secteurs", process: "Processus", proof: "Cas", blog: "Blog", contact: "Contact" },
    skip: "Aller au contenu",
    footer: { line: "Systèmes d'uniformes sur mesure développés à Barcelone.", studio: "Studio", legal: "Légal", pamuuc: "PAMUUC.COM" },
    cookie: { text: "Nous utilisons des cookies analytiques pour comprendre comment les visiteurs utilisent ce site. Vous pouvez accepter ou refuser.", accept: "Accepter", reject: "Refuser" },
    home: {
      title: "Pamuuc Studio | Uniformes sur mesure pour hôtellerie, santé, bien-être et équipes de service",
      description: "Pamuuc Studio conçoit des systèmes d'uniformes sur mesure durables pour l'hôtellerie, la santé, le bien-être et les équipes de service.",
      eyebrow: "Studio de design et production d'uniformes sur mesure",
      h1: "Systèmes d'uniformes sur mesure pour hôtellerie, santé, bien-être et équipes de service",
      statement: "Des systèmes d'uniformes pour des équipes dont les vêtements doivent fonctionner avec justesse chaque jour.",
      lead: "Nous concevons, développons et coordonnons des uniformes sur mesure autour du lieu, des rôles, du lavage et de la continuité des réassorts.",
      primaryCta: "Demander un premier rendez-vous",
      secondaryCta: "Lire les cas studio",
      proof: ["Développement piloté depuis Barcelone", "Pensé pour les lavages fréquents", "Garde-robes par rôle", "Réassorts fiables"],
      introTitle: "L'uniforme comme partie de l'expérience de service",
      introText: "Une garde-robe professionnelle efficace accompagne le mouvement, clarifie les rôles, reflète le lieu et reste cohérente dans le temps.",
      offerTitle: "Ce que nous développons",
      offerLead: "Un service de studio concentré sur les uniformes entièrement sur mesure et les systèmes vestimentaires d'équipe.",
      offers: [
        ["Design d'uniformes sur mesure", "Des vêtements développés autour de l'identité, de la structure d'équipe, du mouvement et de l'usage quotidien."],
        ["Développement produit technique", "Matières, coupe, construction, marquage et finitions choisis pour des conditions réelles."],
        ["Continuité de production", "Patronages et spécifications validés sont archivés pour garantir les futurs réassorts."]
      ],
      sectorsTitle: "À qui s'adresse le studio",
      sectorsLead: "Pour les environnements où le vêtement influence confiance, rythme, confort et perception client.",
      sectors: ["Hôtellerie", "Restauration", "Bien-être", "Santé et cliniques", "Services aux clients", "Équipes de service"],
      processTitle: "Un chemin clair jusqu'à la livraison",
      processLead: "Chaque projet est structuré pour réduire l'incertitude avant la production.",
      steps: [
        ["01", "Découvrir", "Lecture du lieu, des rôles, des flux opérationnels et de la direction visuelle."],
        ["02", "Développer", "Définition des pièces, matières, coupes, finitions, prototypes et essayages."],
        ["03", "Produire", "Les pièces validées passent en production coordonnée puis en livraison finale."],
        ["04", "Continuer", "Patronages et spécifications restent archivés pour des réassorts fiables."]
      ],
      productionTitle: "Les paramètres de production, sans flou",
      productionLead: "Nous cadrons quantité, complexité, délais et budget avant le développement.",
      facts: [["Dès 5 pièces par style", "Les petites séries sont étudiées quand la construction le permet."], ["4-6 semaines", "Fenêtre habituelle de développement."], ["3-5 semaines", "Fenêtre habituelle de production après validation."], ["Prix sur proposition", "Chaque projet est estimé selon les besoins réels."]],
      editorialTitle: "Lectures et cas sélectionnés",
      editorialLead: "Notes sur les systèmes d'uniformes pour hôtellerie, clinique et bien-être.",
      teamTitle: "Une petite équipe, responsable directement",
      teamLead: "Le projet reste proche des personnes qui prennent les décisions de design, produit et coordination.",
      team: [["Leonardo Gobbato", "Fondateur et Head of Product Operations", "Définit les silhouettes, la logique de coupe et les détails techniques répétables."], ["Federica Vianson Cocco", "Co-fondatrice et Head of Business Development", "Guide la relation client, le cadrage et la coordination."], ["Andreas Gonzalez", "Co-fondateur et CEO", "Apporte l'expérience opérationnelle de l'hôtellerie aux décisions de design."]],
      faqTitle: "Avant de commencer",
      faq: [["Travaillez-vous à partir d'un catalogue ?", "Non. Nous pouvons utiliser des bases éprouvées si elles aident les délais ou le budget, mais le projet reste construit autour de votre équipe."], ["Peut-on commencer par un seul rôle ?", "Oui. Beaucoup de projets commencent par un département ou une pièce avant de s'étendre."], ["Gérez-vous les réassorts ?", "Oui. Patronages, matières, finitions et spécifications sont archivés."], ["Travaillez-vous hors de Barcelone ?", "Oui. Les réunions peuvent se faire sur place ou en visio selon le projet."]],
      contactTitle: "Parlez-nous de votre projet",
      contactLead: "Décrivez votre équipe, votre environnement et vos délais. Nous définirons ensemble le chemin le plus efficace.",
      emailCta: "Préférer l'e-mail",
      form: { hint: "Le formulaire prend environ 2 minutes. Nous répondons généralement sous 1 jour ouvré.", name: "Nom complet", email: "E-mail professionnel", phone: "Téléphone", company: "Entreprise", team: "Taille de l'équipe", type: "Type de projet", timeline: "Calendrier visé", brief: "Description du projet", consent: "J'accepte les informations de confidentialité, cookies, conditions et mentions légales.", submit: "Envoyer la demande", sending: "Envoi de votre demande...", success: "Votre demande a été envoyée. Nous répondons généralement sous 1 jour ouvré.", error: "Nous ne pouvons pas envoyer votre demande pour le moment. Réessayez ou utilisez l'e-mail." }
    },
    blogTitle: "Blog Pamuuc Studio",
    blogDescription: "Articles pratiques sur la conception, la mise en place et la continuité des uniformes d'équipe.",
    legalTitle: "Informations légales",
    legalDescription: "Confidentialité, cookies, conditions et mentions légales de Pamuuc Studio."
  },
  it: {
    code: "it",
    label: "IT",
    htmlLang: "it",
    locale: "it_IT",
    name: "Italiano",
    homePath: "/it/",
    blogPath: "/it/blog/",
    legalPath: "/it/legal/",
    nav: { offer: "Offerta", sectors: "Settori", process: "Processo", proof: "Casi", blog: "Blog", contact: "Contatto" },
    skip: "Vai al contenuto",
    footer: { line: "Sistemi di uniformi su misura sviluppati a Barcellona.", studio: "Studio", legal: "Legale", pamuuc: "PAMUUC.COM" },
    cookie: { text: "Usiamo cookie analitici per capire come i visitatori usano questo sito. Puoi accettare o rifiutare.", accept: "Accetta", reject: "Rifiuta" },
    home: {
      title: "Pamuuc Studio | Uniformi su misura per hospitality, sanità, wellness e team di servizio",
      description: "Pamuuc Studio progetta sistemi di uniformi su misura durevoli per hospitality, sanità, wellness e team di servizio.",
      eyebrow: "Studio di design e produzione per uniformi su misura",
      h1: "Sistemi di uniformi su misura per hospitality, sanità, wellness e team di servizio",
      statement: "Sistemi di uniformi per team il cui abbigliamento deve funzionare con eleganza ogni giorno.",
      lead: "Progettiamo, sviluppiamo e coordiniamo uniformi su misura intorno allo spazio, ai ruoli, al lavaggio e alla continuità dei riordini.",
      primaryCta: "Richiedi un primo incontro",
      secondaryCta: "Leggi i casi studio",
      proof: ["Sviluppo guidato da Barcellona", "Pensate per lavaggi frequenti", "Guardaroba per ruolo", "Riordini affidabili"],
      introTitle: "Uniformi come parte dell'esperienza di servizio",
      introText: "Un guardaroba professionale efficace accompagna i movimenti, chiarisce i ruoli, riflette lo spazio e resta coerente nel tempo.",
      offerTitle: "Cosa sviluppiamo",
      offerLead: "Un servizio focalizzato su uniformi completamente su misura e sistemi di guardaroba per team.",
      offers: [["Design di uniformi su misura", "Capi sviluppati intorno a identità, struttura del team, movimento e uso quotidiano."], ["Sviluppo tecnico prodotto", "Materiali, vestibilità, costruzione, branding e finiture scelti per condizioni reali."], ["Continuità produttiva", "Modelli e specifiche approvati vengono archiviati per riordini coerenti."]],
      sectorsTitle: "Per chi è pensato",
      sectorsLead: "Per ambienti in cui l'abbigliamento influisce su fiducia, ritmo, comfort e percezione del cliente.",
      sectors: ["Hospitality", "Food and beverage", "Wellness", "Sanità e cliniche", "Guest services", "Team di servizio"],
      processTitle: "Un percorso chiaro fino alla consegna",
      processLead: "Ogni progetto è strutturato per ridurre l'incertezza prima della produzione.",
      steps: [["01", "Scoprire", "Lettura dello spazio, dei ruoli, dei flussi e della direzione visiva."], ["02", "Sviluppare", "Definizione di capi, materiali, vestibilità, finiture, prototipi e prove."], ["03", "Produrre", "I capi approvati passano in produzione coordinata e consegna."], ["04", "Continuare", "Modelli e specifiche restano archiviati per riordini affidabili."]],
      productionTitle: "Parametri produttivi chiari",
      productionLead: "Quantità, complessità, tempi e budget vengono definiti prima dello sviluppo.",
      facts: [["Da 5 pezzi per stile", "Le piccole serie sono valutate quando la costruzione lo permette."], ["4-6 settimane", "Finestra tipica di sviluppo."], ["3-5 settimane", "Finestra tipica di produzione dopo approvazione."], ["Prezzi su proposta", "Ogni progetto è stimato sui bisogni reali."]],
      editorialTitle: "Letture e casi selezionati",
      editorialLead: "Approfondimenti su uniformi per hospitality, cliniche e wellness.",
      teamTitle: "Un piccolo team con responsabilità diretta",
      teamLead: "Il progetto resta vicino a chi prende decisioni di design, prodotto e coordinamento.",
      team: [["Leonardo Gobbato", "Founder e Head of Product Operations", "Definisce silhouette, vestibilità e dettagli tecnici ripetibili."], ["Federica Vianson Cocco", "Co-founder e Head of Business Development", "Guida relazione cliente, chiarezza del progetto e coordinamento."], ["Andreas Gonzalez", "Co-founder e CEO", "Porta esperienza operativa hospitality nelle decisioni di design."]],
      faqTitle: "Prima di iniziare",
      faq: [["Lavorate da catalogo?", "No. Possiamo usare basi già validate se aiutano tempi o budget, ma il progetto resta su misura."], ["Possiamo iniziare da un solo ruolo?", "Sì. Molti progetti partono da un reparto o da un capo e poi si espandono."], ["Gestite i riordini?", "Sì. Modelli, materiali, finiture e specifiche vengono archiviati."], ["Lavorate fuori Barcellona?", "Sì. Gli incontri possono essere dal vivo o in video in base al progetto."]],
      contactTitle: "Raccontaci il tuo progetto",
      contactLead: "Descrivi team, ambiente e tempi. Definiremo insieme il percorso più efficace.",
      emailCta: "Preferisci l'e-mail",
      form: { hint: "Il modulo richiede circa 2 minuti. Di solito rispondiamo entro 1 giorno lavorativo.", name: "Nome completo", email: "Email aziendale", phone: "Telefono", company: "Azienda", team: "Dimensione team", type: "Tipo di progetto", timeline: "Tempistica", brief: "Descrizione progetto", consent: "Accetto le informazioni su privacy, cookie, termini e note legali.", submit: "Invia richiesta", sending: "Invio della richiesta...", success: "La richiesta è stata inviata. Di solito rispondiamo entro 1 giorno lavorativo.", error: "Non riusciamo a inviare la richiesta ora. Riprova o usa l'e-mail." }
    },
    blogTitle: "Blog Pamuuc Studio",
    blogDescription: "Articoli pratici su progettazione, implementazione e continuità dei sistemi di uniformi.",
    legalTitle: "Informazioni legali",
    legalDescription: "Privacy, cookie, termini e informazioni legali di Pamuuc Studio."
  },
  es: {
    code: "es",
    label: "ES",
    htmlLang: "es",
    locale: "es_ES",
    name: "Español",
    homePath: "/es/",
    blogPath: "/es/blog/",
    legalPath: "/es/legal/",
    nav: { offer: "Oferta", sectors: "Sectores", process: "Proceso", proof: "Casos", blog: "Blog", contact: "Contacto" },
    skip: "Saltar al contenido",
    footer: { line: "Sistemas de uniformes a medida desarrollados en Barcelona.", studio: "Studio", legal: "Legal", pamuuc: "PAMUUC.COM" },
    cookie: { text: "Usamos cookies analíticas para entender cómo los visitantes usan este sitio. Puedes aceptar o rechazar.", accept: "Aceptar", reject: "Rechazar" },
    home: {
      title: "Pamuuc Studio | Uniformes a medida para hostelería, salud, bienestar y equipos de servicio",
      description: "Pamuuc Studio diseña sistemas de uniformes a medida duraderos para hostelería, salud, bienestar y equipos de servicio.",
      eyebrow: "Estudio de diseño y producción de uniformes a medida",
      h1: "Sistemas de uniformes a medida para hostelería, salud, bienestar y equipos de servicio",
      statement: "Sistemas de uniformes para equipos cuya ropa debe funcionar con elegancia cada día.",
      lead: "Diseñamos, desarrollamos y coordinamos uniformes a medida alrededor del espacio, los roles, el lavado y la continuidad de reposición.",
      primaryCta: "Solicitar una primera reunión",
      secondaryCta: "Leer los casos",
      proof: ["Desarrollo desde Barcelona", "Pensados para lavado frecuente", "Sistemas por rol", "Reposiciones fiables"],
      introTitle: "El uniforme como parte de la experiencia de servicio",
      introText: "Un vestuario profesional eficaz acompaña el movimiento, clarifica roles, refleja el espacio y mantiene coherencia con el tiempo.",
      offerTitle: "Qué desarrollamos",
      offerLead: "Un servicio de estudio enfocado en uniformes totalmente a medida y sistemas de vestuario para equipos.",
      offers: [["Diseño de uniformes a medida", "Prendas desarrolladas alrededor de identidad, estructura del equipo, movimiento y uso diario."], ["Desarrollo técnico de producto", "Materiales, fit, construcción, branding y acabados elegidos para condiciones reales."], ["Continuidad de producción", "Patrones y especificaciones aprobadas se archivan para reposiciones coherentes."]],
      sectorsTitle: "Para quién es",
      sectorsLead: "Para entornos donde la ropa influye en confianza, ritmo, comodidad y percepción del cliente.",
      sectors: ["Hostelería", "Restauración", "Bienestar", "Salud y clínicas", "Atención al cliente", "Equipos de servicio"],
      processTitle: "Un camino claro hasta la entrega",
      processLead: "Cada proyecto se estructura para reducir incertidumbre antes de producir.",
      steps: [["01", "Descubrir", "Leemos el espacio, los roles, los flujos operativos y la dirección visual."], ["02", "Desarrollar", "Definimos prendas, materiales, fit, acabados, prototipos y pruebas."], ["03", "Producir", "Las piezas aprobadas pasan a producción coordinada y entrega final."], ["04", "Continuar", "Patrones y especificaciones quedan archivados para reposiciones fiables."]],
      productionTitle: "Parámetros de producción claros",
      productionLead: "Definimos cantidad, complejidad, tiempos y presupuesto antes del desarrollo.",
      facts: [["Desde 5 piezas por estilo", "Las pequeñas series se valoran cuando la construcción lo permite."], ["4-6 semanas", "Ventana habitual de desarrollo."], ["3-5 semanas", "Ventana habitual de producción tras aprobación."], ["Precio por propuesta", "Cada proyecto se estima según necesidades reales."]],
      editorialTitle: "Lecturas y casos seleccionados",
      editorialLead: "Notas sobre uniformes para hostelería, clínicas y bienestar.",
      teamTitle: "Un equipo pequeño con responsabilidad directa",
      teamLead: "El proyecto se mantiene cerca de quienes toman las decisiones de diseño, producto y coordinación.",
      team: [["Leonardo Gobbato", "Founder y Head of Product Operations", "Define siluetas, lógica de fit y detalles técnicos repetibles."], ["Federica Vianson Cocco", "Co-founder y Head of Business Development", "Guía la relación con cliente, claridad del proyecto y coordinación."], ["Andreas Gonzalez", "Co-founder y CEO", "Aporta experiencia operativa de hostelería a decisiones de diseño."]],
      faqTitle: "Antes de empezar",
      faq: [["¿Trabajáis desde catálogo?", "No. Podemos usar bases probadas si ayudan al timing o al presupuesto, pero el proyecto se define a medida."], ["¿Podemos empezar por un solo rol?", "Sí. Muchos proyectos empiezan con un departamento o prenda y luego crecen."], ["¿Gestionáis reposiciones?", "Sí. Patrones, materiales, acabados y especificaciones se archivan."], ["¿Trabajáis fuera de Barcelona?", "Sí. Las reuniones pueden ser presenciales o por vídeo según el proyecto."]],
      contactTitle: "Cuéntanos tu proyecto",
      contactLead: "Descríbenos equipo, entorno y tiempos. Definiremos juntos el camino más eficaz.",
      emailCta: "Prefiero e-mail",
      form: { hint: "Completar el formulario lleva unos 2 minutos. Normalmente respondemos en 1 día laborable.", name: "Nombre completo", email: "Email profesional", phone: "Teléfono", company: "Empresa", team: "Tamaño del equipo", type: "Tipo de proyecto", timeline: "Calendario objetivo", brief: "Descripción del proyecto", consent: "Acepto la información de privacidad, cookies, términos y aviso legal.", submit: "Enviar solicitud", sending: "Enviando tu solicitud...", success: "Tu solicitud se ha enviado. Normalmente respondemos en 1 día laborable.", error: "No hemos podido enviar la solicitud. Inténtalo de nuevo o usa el e-mail." }
    },
    blogTitle: "Blog Pamuuc Studio",
    blogDescription: "Artículos prácticos sobre diseño, implementación y continuidad de sistemas de uniformes.",
    legalTitle: "Información legal",
    legalDescription: "Privacidad, cookies, términos e información legal de Pamuuc Studio."
  },
  de: {
    code: "de",
    label: "DE",
    htmlLang: "de",
    locale: "de_DE",
    name: "Deutsch",
    homePath: "/de/",
    blogPath: "/de/blog/",
    legalPath: "/de/legal/",
    nav: { offer: "Angebot", sectors: "Bereiche", process: "Prozess", proof: "Fälle", blog: "Blog", contact: "Kontakt" },
    skip: "Zum Inhalt springen",
    footer: { line: "Maßgeschneiderte Uniformsysteme, entwickelt in Barcelona.", studio: "Studio", legal: "Rechtliches", pamuuc: "PAMUUC.COM" },
    cookie: { text: "Wir verwenden Analyse-Cookies, um zu verstehen, wie Besucher diese Website nutzen. Sie können akzeptieren oder ablehnen.", accept: "Akzeptieren", reject: "Ablehnen" },
    home: {
      title: "Pamuuc Studio | Maßgeschneiderte Uniformen für Hospitality, Gesundheit, Wellness und Serviceteams",
      description: "Pamuuc Studio entwickelt langlebige maßgeschneiderte Uniformsysteme für Hospitality, Gesundheit, Wellness und Serviceteams.",
      eyebrow: "Design- und Produktionsstudio für maßgeschneiderte Uniformen",
      h1: "Maßgeschneiderte Uniformsysteme für Hospitality, Gesundheit, Wellness und Serviceteams",
      statement: "Uniformsysteme für Teams, deren Kleidung jeden Tag schön und verlässlich funktionieren muss.",
      lead: "Wir entwerfen, entwickeln und koordinieren maßgeschneiderte Uniformen rund um Raum, Rollen, Waschzyklen und langfristige Nachbestellungen.",
      primaryCta: "Erstgespräch anfragen",
      secondaryCta: "Studio-Fälle lesen",
      proof: ["Entwicklung aus Barcelona", "Für häufiges Waschen", "Garderoben nach Rolle", "Zuverlässige Nachbestellungen"],
      introTitle: "Uniformen als Teil des Serviceerlebnisses",
      introText: "Eine gute professionelle Garderobe unterstützt Bewegung, klärt Rollen, spiegelt den Raum und bleibt langfristig konsistent.",
      offerTitle: "Was wir entwickeln",
      offerLead: "Ein fokussierter Studio-Service für vollständig maßgeschneiderte Uniformen und Team-Garderobensysteme.",
      offers: [["Maßgeschneidertes Uniformdesign", "Kleidungsstücke, entwickelt für Identität, Teamstruktur, Bewegung und täglichen Einsatz."], ["Technische Produktentwicklung", "Materialien, Passform, Konstruktion, Branding und Details für reale Arbeitsbedingungen."], ["Produktionskontinuität", "Validierte Schnitte und Spezifikationen werden für konsistente Nachbestellungen archiviert."]],
      sectorsTitle: "Für wen es gedacht ist",
      sectorsLead: "Für Umgebungen, in denen Kleidung Vertrauen, Rhythmus, Komfort und Gästewahrnehmung beeinflusst.",
      sectors: ["Hospitality", "Food and beverage", "Wellness", "Gesundheit und Kliniken", "Guest Services", "Serviceteams"],
      processTitle: "Ein klarer Weg bis zur Lieferung",
      processLead: "Jedes Projekt wird strukturiert, um Unsicherheit vor der Produktion zu reduzieren.",
      steps: [["01", "Entdecken", "Wir lesen Raum, Rollen, Abläufe und visuelle Richtung."], ["02", "Entwickeln", "Wir definieren Kleidungsstücke, Materialien, Passform, Details, Prototypen und Anproben."], ["03", "Produzieren", "Freigegebene Teile gehen in koordinierte Produktion und Lieferung."], ["04", "Fortführen", "Schnitte und Spezifikationen bleiben für Nachbestellungen archiviert."]],
      productionTitle: "Produktionsparameter klar erklärt",
      productionLead: "Menge, Komplexität, Zeitplan und Budget werden vor der Entwicklung definiert.",
      facts: [["Ab 5 Teilen pro Stil", "Kleine Serien werden geprüft, wenn die Konstruktion es erlaubt."], ["4-6 Wochen", "Typisches Entwicklungsfenster."], ["3-5 Wochen", "Typisches Produktionsfenster nach Freigabe."], ["Preis nach Angebot", "Jedes Projekt wird nach tatsächlichem Bedarf kalkuliert."]],
      editorialTitle: "Ausgewählte Artikel und Fälle",
      editorialLead: "Vertiefende Hinweise zu Uniformsystemen für Hospitality, Kliniken und Wellness.",
      teamTitle: "Ein kleines Team mit direkter Verantwortung",
      teamLead: "Das Projekt bleibt nah bei den Personen, die Design-, Produkt- und Koordinationsentscheidungen treffen.",
      team: [["Leonardo Gobbato", "Founder und Head of Product Operations", "Definiert Silhouetten, Passformlogik und wiederholbare technische Details."], ["Federica Vianson Cocco", "Co-founder und Head of Business Development", "Begleitet Kundenbeziehung, Projektklarheit und Koordination."], ["Andreas Gonzalez", "Co-founder und CEO", "Bringt operative Hospitality-Erfahrung in Designentscheidungen ein."]],
      faqTitle: "Bevor wir beginnen",
      faq: [["Arbeitet ihr aus einem Katalog?", "Nein. Bewährte Grundlagen können helfen, aber jedes Projekt wird um Team und Raum entwickelt."], ["Können wir mit einer Rolle starten?", "Ja. Viele Projekte beginnen mit einer Abteilung oder einem Kleidungsstück und wachsen danach."], ["Übernehmt ihr Nachbestellungen?", "Ja. Schnitte, Materialien, Details und Spezifikationen werden archiviert."], ["Arbeitet ihr außerhalb von Barcelona?", "Ja. Meetings können je nach Projekt vor Ort oder per Video stattfinden."]],
      contactTitle: "Teilen Sie Ihr Projekt mit uns",
      contactLead: "Beschreiben Sie Team, Umgebung und Zeitplan. Gemeinsam definieren wir den sinnvollsten Weg.",
      emailCta: "Lieber per E-Mail",
      form: { hint: "Das Formular dauert etwa 2 Minuten. Wir antworten normalerweise innerhalb eines Werktags.", name: "Vollständiger Name", email: "Geschäftliche E-Mail", phone: "Telefonnummer", company: "Unternehmen", team: "Teamgröße", type: "Projekttyp", timeline: "Zielzeitraum", brief: "Projektbeschreibung", consent: "Ich akzeptiere Datenschutz-, Cookie-, Nutzungs- und Rechtsinformationen.", submit: "Projektanfrage senden", sending: "Ihre Anfrage wird gesendet...", success: "Ihre Anfrage wurde gesendet. Wir antworten in der Regel innerhalb eines Werktags.", error: "Die Anfrage konnte nicht gesendet werden. Bitte erneut versuchen oder E-Mail nutzen." }
    },
    blogTitle: "Pamuuc Studio Blog",
    blogDescription: "Praktische Artikel über Design, Umsetzung und Kontinuität von Uniformsystemen.",
    legalTitle: "Rechtliche Informationen",
    legalDescription: "Datenschutz-, Cookie-, Nutzungs- und rechtliche Informationen von Pamuuc Studio."
  }
};

const uiText = {
  en: {
    production: "Production",
    team: "Team",
    faq: "FAQ",
    editorial: "Editorial",
    legalInfo: "Legal information",
    select: "Select",
    legal: { privacy: "Privacy", cookies: "Cookies", terms: "Terms", notice: "Legal notice" },
    teamOptions: ["Under 10", "10 - 25", "26 - 50", "51 - 120", "120+"],
    projectOptions: ["Fully custom uniform system", "Single role", "Single garment", "Specific department", "Merchandising", "Other"],
    timelineOptions: ["As soon as possible", "Within 1-2 months", "Within 3-4 months", "Planned for later this year", "Specific date"]
  },
  fr: {
    production: "Production",
    team: "Équipe",
    faq: "FAQ",
    editorial: "Éditorial",
    legalInfo: "Informations légales",
    select: "Sélectionner",
    legal: { privacy: "Confidentialité", cookies: "Cookies", terms: "Conditions", notice: "Mentions légales" },
    teamOptions: ["Moins de 10", "10 - 25", "26 - 50", "51 - 120", "120+"],
    projectOptions: ["Système d'uniformes entièrement sur mesure", "Un seul rôle", "Une seule pièce", "Un département spécifique", "Merchandising", "Autre"],
    timelineOptions: ["Dès que possible", "Sous 1-2 mois", "Sous 3-4 mois", "Prévu plus tard cette année", "Date spécifique"]
  },
  it: {
    production: "Produzione",
    team: "Team",
    faq: "FAQ",
    editorial: "Editoriale",
    legalInfo: "Informazioni legali",
    select: "Seleziona",
    legal: { privacy: "Privacy", cookies: "Cookie", terms: "Termini", notice: "Note legali" },
    teamOptions: ["Meno di 10", "10 - 25", "26 - 50", "51 - 120", "120+"],
    projectOptions: ["Sistema di uniformi completamente su misura", "Un solo ruolo", "Un solo capo", "Un reparto specifico", "Merchandising", "Altro"],
    timelineOptions: ["Il prima possibile", "Entro 1-2 mesi", "Entro 3-4 mesi", "Previsto più avanti quest'anno", "Data specifica"]
  },
  es: {
    production: "Producción",
    team: "Equipo",
    faq: "FAQ",
    editorial: "Editorial",
    legalInfo: "Información legal",
    select: "Seleccionar",
    legal: { privacy: "Privacidad", cookies: "Cookies", terms: "Términos", notice: "Aviso legal" },
    teamOptions: ["Menos de 10", "10 - 25", "26 - 50", "51 - 120", "120+"],
    projectOptions: ["Sistema de uniformes totalmente a medida", "Un solo rol", "Una sola prenda", "Un departamento específico", "Merchandising", "Otro"],
    timelineOptions: ["Lo antes posible", "En 1-2 meses", "En 3-4 meses", "Planificado para más adelante este año", "Fecha específica"]
  },
  de: {
    production: "Produktion",
    team: "Team",
    faq: "FAQ",
    editorial: "Editorial",
    legalInfo: "Rechtliche Informationen",
    select: "Auswählen",
    legal: { privacy: "Datenschutz", cookies: "Cookies", terms: "Nutzungsbedingungen", notice: "Impressum" },
    teamOptions: ["Unter 10", "10 - 25", "26 - 50", "51 - 120", "120+"],
    projectOptions: ["Vollständig maßgeschneidertes Uniformsystem", "Eine Rolle", "Ein Kleidungsstück", "Eine bestimmte Abteilung", "Merchandising", "Andere"],
    timelineOptions: ["So bald wie möglich", "Innerhalb von 1-2 Monaten", "Innerhalb von 3-4 Monaten", "Später in diesem Jahr geplant", "Bestimmtes Datum"]
  }
};

const blogTopics = {
  dental: {
    image: "custom-dental-clinic-uniforms-barcelona.jpg",
    date: "2026-03-10",
    author: "Pamuuc Studio",
    dateDisplay: { en: "10 March 2026", fr: "10 mars 2026", it: "10 marzo 2026", es: "10 de marzo de 2026", de: "10. März 2026" },
    data: {
      en: { path: "/en/blog/custom-dental-clinic-uniforms-barcelona/", old: "en/blog/custom-dental-clinic-uniforms-barcelona/index.html", title: "Custom uniforms for dental clinics: building a team wardrobe aligned with the brand in Barcelona", description: "How a premium Barcelona dental clinic used custom uniforms to connect brand, space, comfort, and everyday clinical work.", kicker: "Uniform design direction", alt: "Dental clinic team in coordinated custom uniforms inside a refined Barcelona practice" },
      fr: { path: "/fr/blog/uniformes-clinique-dentaire-sur-mesure-barcelone/", old: "fr/blog/uniformes-clinique-dentaire-sur-mesure-barcelone/index.html", title: "Uniformes sur mesure pour les cliniques dentaires : construire une garde-robe d'équipe alignée avec la marque à Barcelone", description: "Comment une clinique dentaire premium à Barcelone a utilisé les uniformes sur mesure pour relier marque, espace et usage quotidien.", kicker: "Direction d'uniformes", alt: "Équipe de clinique dentaire avec uniformes coordonnés" },
      it: { path: "/it/blog/divise-clinica-dentale-personalizzate-barcellona/", old: "it/blog/divise-clinica-dentale-personalizzate-barcellona/index.html", title: "Divise personalizzate per cliniche dentali: costruire un guardaroba di team allineato al brand a Barcellona", description: "Come una clinica dentale premium a Barcellona ha usato uniformi su misura per collegare brand, spazio e lavoro quotidiano.", kicker: "Direzione uniformi", alt: "Team di clinica dentale con uniformi coordinate" },
      es: { path: "/es/blog/uniformes-clinica-dental-personalizados-barcelona/", old: "es/blog/uniformes-clinica-dental-personalizados-barcelona/index.html", title: "Uniformes a medida para clínicas dentales: construir un vestuario de equipo alineado con la marca en Barcelona", description: "Cómo una clínica dental premium en Barcelona usó uniformes a medida para unir marca, espacio y trabajo diario.", kicker: "Dirección de uniformes", alt: "Equipo de clínica dental con uniformes coordinados" },
      de: { path: "/de/blog/uniformen-zahnarztpraxen-barcelona/", old: "de/blog/uniformen-zahnarztpraxen-barcelona/index.html", title: "Individuelle Uniformen für Zahnarztpraxen: eine Teamgarderobe im Einklang mit der Marke in Barcelona", description: "Wie eine Premium-Zahnarztpraxis in Barcelona maßgeschneiderte Uniformen für Marke, Raum und Alltag einsetzte.", kicker: "Uniform Design Direction", alt: "Zahnarztpraxis-Team mit koordinierten Uniformen" }
    }
  },
  hospitality: {
    image: "custom-hospitality-uniforms.jpg",
    date: "2026-03-10",
    author: "Leonardo Gobbato",
    dateDisplay: { en: "10 March 2026", fr: "10 mars 2026", it: "10 marzo 2026", es: "10 de marzo de 2026", de: "10. März 2026" },
    data: {
      en: { path: "/en/blog/custom-hospitality-uniforms/", old: "en/blog/custom-hospitality-uniforms/index.html", title: "Custom uniforms for hospitality: design and durability in hotel workwear", description: "A hospitality case study on bespoke hotel uniforms, durable fabrics, role-based wardrobes, and local production.", kicker: "Hospitality case", alt: "METT Barcelona luxury hotel exterior" },
      fr: { path: "/fr/blog/uniformes-hotellerie-personnalises/", old: "fr/blog/uniformes-hotellerie-personnalises/index.html", title: "Uniformes sur mesure pour l'hôtellerie : design et durabilité des vêtements de travail hôteliers", description: "Un cas d'hôtellerie sur uniformes sur mesure, matières durables, rôles et production locale.", kicker: "Cas hôtellerie", alt: "Hôtel de luxe METT Barcelona" },
      it: { path: "/it/blog/divise-hospitalita-personalizzate/", old: "it/blog/divise-hospitalita-personalizzate/index.html", title: "Divise personalizzate per l'ospitalità: design e durabilità dell'abbigliamento hotel", description: "Un caso hospitality su uniformi su misura, tessuti durevoli, guardaroba per ruolo e produzione locale.", kicker: "Caso hospitality", alt: "Hotel di lusso METT Barcelona" },
      es: { path: "/es/blog/uniformes-hosteleria-personalizados/", old: "es/blog/uniformes-hosteleria-personalizados/index.html", title: "Uniformes a medida para hostelería: diseño y durabilidad de la ropa de trabajo hotelera", description: "Un caso de hostelería sobre uniformes a medida, tejidos duraderos, roles y producción local.", kicker: "Caso hostelería", alt: "Hotel de lujo METT Barcelona" },
      de: { path: "/de/blog/uniformen-hotellerie/", old: "de/blog/uniformen-hotellerie/index.html", title: "Individuelle Uniformen für die Hotellerie: Design und Haltbarkeit in der Hotel-Arbeitskleidung", description: "Ein Hospitality-Fall über maßgeschneiderte Hoteluniformen, langlebige Stoffe, Rollen und lokale Produktion.", kicker: "Hospitality Case", alt: "Luxushotel METT Barcelona" }
    }
  },
  wellness: {
    image: "wellness-studio-uniform-system.jpg",
    date: "2026-03-10",
    author: "Pamuuc Studio",
    dateDisplay: { en: "10 March 2026", fr: "10 mars 2026", it: "10 marzo 2026", es: "10 de marzo de 2026", de: "10. März 2026" },
    data: {
      en: { path: "/en/blog/wellness-studio-uniform-system/", old: "en/blog/wellness-studio-uniform-system/index.html", title: "Designing uniforms for modern wellness studios", description: "A practical guide to wellness studio uniforms that align spatial identity, team comfort, and operational continuity.", kicker: "Operational continuity", alt: "Team wardrobe system for wellness studios" },
      fr: { path: "/fr/blog/uniformes-studios-bien-etre/", old: "fr/blog/uniformes-studios-bien-etre/index.html", title: "Concevoir des uniformes pour des studios de bien-être contemporains", description: "Guide pratique pour des uniformes de bien-être alignant identité du lieu, confort d'équipe et continuité.", kicker: "Continuité opérationnelle", alt: "Système de garde-robe pour studio de bien-être" },
      it: { path: "/it/blog/divise-studi-benessere/", old: "it/blog/divise-studi-benessere/index.html", title: "Progettare uniformi per studi di benessere moderni", description: "Guida pratica per uniformi wellness allineate a spazio, comfort del team e continuità operativa.", kicker: "Continuità operativa", alt: "Sistema guardaroba per studio wellness" },
      es: { path: "/es/blog/uniformes-estudios-bienestar/", old: "es/blog/uniformes-estudios-bienestar/index.html", title: "Diseñar uniformes para estudios de bienestar modernos", description: "Guía práctica para uniformes de bienestar alineados con espacio, comodidad del equipo y continuidad.", kicker: "Continuidad operativa", alt: "Sistema de vestuario para estudio de bienestar" },
      de: { path: "/de/blog/uniformen-wellness-studios/", old: "de/blog/uniformen-wellness-studios/index.html", title: "Uniformen für moderne Wellness-Studios gestalten", description: "Praktischer Leitfaden für Wellness-Uniformen mit Raumidentität, Teamkomfort und Kontinuität.", kicker: "Operative Kontinuität", alt: "Team-Garderobensystem für Wellness-Studios" }
    }
  }
};

const legalSlugs = [
  ["privacy", "privacy-policy"],
  ["cookies", "cookie-policy"],
  ["terms", "terms-and-conditions"],
  ["legal-notice", "legal-notice"]
];

const GILMER_FONTS = [
  { weight: 300, name: "Light",   file: "Gilmer-Light.woff",   url: "https://cdn.shopify.com/s/files/1/0577/3688/8485/files/Gilmer_Light.woff?v=1712156359" },
  { weight: 400, name: "Regular", file: "Gilmer-Regular.woff", url: "https://cdn.shopify.com/s/files/1/0577/3688/8485/files/Gilmer_Regular.woff?v=1712156359" },
  { weight: 700, name: "Bold",    file: "Gilmer-Bold.woff",    url: "https://cdn.shopify.com/s/files/1/0577/3688/8485/files/Gilmer_Bold.woff?v=1712156359" },
  { weight: 900, name: "Heavy",   file: "Gilmer-Heavy.woff",   url: "https://cdn.shopify.com/s/files/1/0577/3688/8485/files/Gilmer_Heavy.woff?v=1712156359" },
];

async function downloadFont(url, destRelPath) {
  const dest = path.join(DIST, destRelPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    function get(targetUrl) {
      https.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${targetUrl}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      }).on("error", reject);
    }
    get(url);
  });
}

function cleanDist() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function writeFile(routePath, html) {
  const normalized = routePath === "/" ? "index.html" : path.join(routePath.slice(1), "index.html");
  const target = path.join(DIST, normalized);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
}

function writeAsset(relativePath, content) {
  const target = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function copyAsset(source, target) {
  const destination = path.join(DIST, target);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(ROOT, source), destination);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function absolute(routePath) {
  return `${BASE_URL}${routePath}`;
}

function filePathFor(routePath) {
  return routePath === "/" ? path.join(DIST, "index.html") : path.join(DIST, routePath.slice(1), "index.html");
}

function currentYear() {
  return "2026";
}

function homePath(code) {
  return languages[code].homePath;
}

function blogPath(code) {
  return languages[code].blogPath;
}

function legalPath(code) {
  return languages[code].legalPath;
}

function routeForLegalSource(code, slug) {
  return code === "en" ? `${slug}/index.html` : `${code}/${slug}/index.html`;
}

function homeAlternates() {
  return Object.fromEntries(languageOrder.map((code) => [code, homePath(code)]).concat([["x-default", homePath("en")]]));
}

function blogIndexAlternates() {
  return Object.fromEntries(languageOrder.map((code) => [code, blogPath(code)]).concat([["x-default", blogPath("en")]]));
}

function legalAlternates() {
  return Object.fromEntries(languageOrder.map((code) => [code, legalPath(code)]).concat([["x-default", legalPath("en")]]));
}

function articleAlternates(topicKey) {
  const topic = blogTopics[topicKey];
  return Object.fromEntries(languageOrder.map((code) => [code, topic.data[code].path]).concat([["x-default", topic.data.en.path]]));
}

function hreflangTags(alternates) {
  return Object.entries(alternates)
    .map(([lang, href]) => `<link rel="alternate" hreflang="${lang}" href="${absolute(href)}">`)
    .join("\n");
}

function languageSwitcher(alternates, currentCode) {
  const items = languageOrder
    .map((code) => {
      const active = code === currentCode ? " is-active" : "";
      return `<a class="lang-link${active}" href="${alternates[code]}" hreflang="${code}">${languages[code].label}</a>`;
    })
    .join("");
  return `<nav class="language-switcher" aria-label="Language selector">${items}</nav>`;
}

function structuredData(data) {
  return `<script type="application/ld+json">${JSON.stringify(data, null, 2)}</script>`;
}

function optionTags(values, placeholder) {
  return `<option value="">${escapeHtml(placeholder)}</option>${values.map((value) => `<option>${escapeHtml(value)}</option>`).join("")}`;
}

function pageLayout({ lang, routePath, title, description, robots = "index,follow,max-image-preview:large", alternates, bodyClass = "", pageType, main, schema = [], image = "/assets/images/social-home-preview.jpg", imageAlt = "" }) {
  const l = languages[lang];
  const ui = uiText[lang];
  const nav = l.nav;
  const canonical = absolute(routePath);
  const scripts = schema.map(structuredData).join("\n");
  const home = homePath(lang);
  const blog = blogPath(lang);
  const legal = legalPath(lang);

  return `<!doctype html>
<html lang="${l.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="${robots}">
<meta name="googlebot" content="${robots}">
<link rel="canonical" href="${canonical}">
${hreflangTags(alternates)}
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Pamuuc Studio">
<meta property="og:locale" content="${l.locale}">
${languageOrder.filter((code) => code !== lang).map((code) => `<meta property="og:locale:alternate" content="${languages[code].locale}">`).join("\n")}
<meta property="og:image" content="${absolute(image)}">
${imageAlt ? `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${absolute(image)}">
${imageAlt ? `<meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}">` : ""}
<meta name="theme-color" content="#fbf7ef">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; img-src 'self' data: https://www.google-analytics.com; style-src 'self' 'unsafe-inline'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://formspree.io https://www.google-analytics.com https://analytics.google.com; form-action https://formspree.io; upgrade-insecure-requests">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/favicon.png">
<link rel="preload" href="/assets/fonts/Gilmer-Regular.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="/assets/fonts/Gilmer-Bold.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="/assets/css/site.css" as="style">
<link rel="stylesheet" href="/assets/css/site.css">
${scripts}
<script defer src="/assets/js/site.js"></script>
</head>
<body class="${bodyClass}" data-page-type="${pageType}" data-language="${lang}">
<a class="skip-link" href="#main">${escapeHtml(l.skip)}</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${home}" aria-label="Pamuuc Studio home"><img src="/assets/images/logo.png" alt="Pamuuc Studio" width="200" height="40"></a>
    <button class="menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false"><span></span><span></span><span></span><span class="sr-only">Menu</span></button>
    <nav class="site-nav" id="site-nav" aria-label="Primary navigation">
      <a href="${home}#offer">${escapeHtml(nav.offer)}</a>
      <a href="${home}#sectors">${escapeHtml(nav.sectors)}</a>
      <a href="${home}#process">${escapeHtml(nav.process)}</a>
      <a href="${home}#proof">${escapeHtml(nav.proof)}</a>
      <a href="${blog}">${escapeHtml(nav.blog)}</a>
      <a class="nav-cta" href="${home}#contact">${escapeHtml(nav.contact)}</a>
    </nav>
    ${languageSwitcher(alternates, lang)}
  </div>
</header>
<main id="main">
${main}
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <img src="/assets/images/logo.png" alt="Pamuuc Studio" width="170" height="34" loading="lazy">
      <p>${escapeHtml(l.footer.line)}</p>
      <p>PAMUUC ORGANIC CLOTHING S.L. · NIF/CIF B0541782 · Barcelona · info@pamuuc.com</p>
    </div>
    <nav class="footer-links" aria-label="${escapeHtml(l.footer.studio)}">
      <a href="${home}#offer">${escapeHtml(nav.offer)}</a>
      <a href="${home}#process">${escapeHtml(nav.process)}</a>
      <a href="${blog}">${escapeHtml(nav.blog)}</a>
      <a href="https://pamuuc.com" rel="noopener noreferrer">${escapeHtml(l.footer.pamuuc)}</a>
    </nav>
    <nav class="footer-links" aria-label="${escapeHtml(l.footer.legal)}">
      <a href="${legal}#privacy">${escapeHtml(ui.legal.privacy)}</a>
      <a href="${legal}#cookies">${escapeHtml(ui.legal.cookies)}</a>
      <a href="${legal}#terms">${escapeHtml(ui.legal.terms)}</a>
      <a href="${legal}#legal-notice">${escapeHtml(ui.legal.notice)}</a>
    </nav>
    ${languageSwitcher(alternates, lang)}
  </div>
  <p class="copyright">© ${currentYear()} Pamuuc Studio</p>
</footer>
<aside class="cookie-banner" data-cookie-banner hidden>
  <p>${escapeHtml(l.cookie.text)}</p>
  <div class="cookie-actions">
    <button class="cookie-btn cookie-btn-accept" type="button" data-cookie-accept>${escapeHtml(l.cookie.accept)}</button>
    <button class="cookie-btn cookie-btn-reject" type="button" data-cookie-reject>${escapeHtml(l.cookie.reject)}</button>
  </div>
</aside>
</body>
</html>`;
}

function renderHome(lang) {
  const l = languages[lang];
  const ui = uiText[lang];
  const h = l.home;
  const alternates = homeAlternates();
  const mailto = "mailto:andreas@pamuuc.com,federica@pamuuc.com,leo.gobbato@pamuuc.com?subject=Pamuuc%20Studio%20project%20request";
  const editorialCards = Object.entries(blogTopics)
    .map(([key, topic]) => {
      const data = topic.data[lang];
      return `<article class="editorial-card">
        <a href="${data.path}">
          <img src="/assets/images/blog/${topic.image}" alt="${escapeHtml(data.alt)}" width="760" height="540" loading="lazy">
          <span>${escapeHtml(data.kicker)}</span>
          <h3>${escapeHtml(data.title)}</h3>
          <p>${escapeHtml(data.description)}</p>
        </a>
      </article>`;
    })
    .join("\n");
  const main = `
<section class="hero">
  <img class="hero-image" src="/assets/images/hero.jpg" alt="Pamuuc Studio custom uniform environment" width="1600" height="1000" fetchpriority="high">
  <div class="hero-scrim"></div>
  <div class="container hero-inner reveal">
    <p class="eyebrow">${escapeHtml(h.eyebrow)}</p>
    <h1>${escapeHtml(h.h1)}</h1>
    <p class="hero-statement">${escapeHtml(h.statement)}</p>
    <p class="hero-lead">${escapeHtml(h.lead)}</p>
    <div class="hero-actions">
      <a class="button button-primary" href="#contact">${escapeHtml(h.primaryCta)}</a>
      <a class="button button-light" href="#proof">${escapeHtml(h.secondaryCta)}</a>
    </div>
  </div>
</section>
<section class="proof-strip">
  <div class="container proof-strip-inner">${h.proof.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
</section>
<section class="section intro-section" id="offer">
  <div class="container two-column">
    <div class="section-heading reveal">
      <p class="eyebrow">${escapeHtml(h.introTitle)}</p>
      <h2>${escapeHtml(h.offerTitle)}</h2>
    </div>
    <div class="lead-stack reveal">
      <p>${escapeHtml(h.introText)}</p>
      <p>${escapeHtml(h.offerLead)}</p>
    </div>
  </div>
  <div class="container offer-grid">
    ${h.offers.map(([title, text]) => `<article class="quiet-card reveal"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join("")}
  </div>
</section>
<section class="section section-tint" id="sectors">
  <div class="container two-column">
    <div class="section-heading reveal">
      <p class="eyebrow">${escapeHtml(l.nav.sectors)}</p>
      <h2>${escapeHtml(h.sectorsTitle)}</h2>
    </div>
    <p class="section-lead reveal">${escapeHtml(h.sectorsLead)}</p>
  </div>
  <div class="container sector-grid reveal">
    ${h.sectors.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
  </div>
</section>
<section class="section" id="process">
  <div class="container section-heading narrow reveal">
    <p class="eyebrow">${escapeHtml(l.nav.process)}</p>
    <h2>${escapeHtml(h.processTitle)}</h2>
    <p>${escapeHtml(h.processLead)}</p>
  </div>
  <div class="container timeline">
    ${h.steps.map(([number, title, text]) => `<article class="timeline-step reveal"><span>${escapeHtml(number)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join("")}
  </div>
</section>
<section class="section production-section">
  <div class="container two-column">
    <div class="section-heading reveal">
      <p class="eyebrow">${escapeHtml(ui.production)}</p>
      <h2>${escapeHtml(h.productionTitle)}</h2>
      <p>${escapeHtml(h.productionLead)}</p>
    </div>
    <div class="facts-grid">
      ${h.facts.map(([number, label]) => `<article class="fact reveal"><strong>${escapeHtml(number)}</strong><span>${escapeHtml(label)}</span></article>`).join("")}
    </div>
  </div>
</section>
<section class="section section-tint" id="proof">
  <div class="container section-heading narrow reveal">
    <p class="eyebrow">${escapeHtml(l.nav.proof)}</p>
    <h2>${escapeHtml(h.editorialTitle)}</h2>
    <p>${escapeHtml(h.editorialLead)}</p>
  </div>
  <div class="container editorial-grid">${editorialCards}</div>
</section>
<section class="section team-section">
  <div class="container two-column">
    <div class="section-heading reveal">
      <p class="eyebrow">${escapeHtml(ui.team)}</p>
      <h2>${escapeHtml(h.teamTitle)}</h2>
      <p>${escapeHtml(h.teamLead)}</p>
    </div>
    <div class="team-list">
      ${h.team.map(([name, role, text]) => { const photo = TEAM_PHOTOS[name]; return `<article class="team-card reveal">${photo ? `<img class="team-photo" src="/assets/images/${photo}.svg" alt="${escapeHtml(name)}" width="200" height="200" loading="lazy">` : ""}<div class="team-body"><h3>${escapeHtml(name)}</h3><p class="role">${escapeHtml(role)}</p><p>${escapeHtml(text)}</p></div></article>`; }).join("")}
    </div>
  </div>
</section>
<section class="section faq-section">
  <div class="container two-column">
    <div class="section-heading reveal">
      <p class="eyebrow">${escapeHtml(ui.faq)}</p>
      <h2>${escapeHtml(h.faqTitle)}</h2>
    </div>
    <div class="faq-list reveal">
      ${h.faq.map(([q, a]) => `<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join("")}
    </div>
  </div>
</section>
<section class="section contact-section" id="contact">
  <div class="container contact-layout">
    <div class="contact-copy reveal">
      <p class="eyebrow">${escapeHtml(l.nav.contact)}</p>
      <h2>${escapeHtml(h.contactTitle)}</h2>
      <p>${escapeHtml(h.contactLead)}</p>
      <a class="button button-secondary" href="${mailto}">${escapeHtml(h.emailCta)}</a>
    </div>
    <form class="contact-form reveal" action="${FORM_ENDPOINT}" method="post" data-contact-form>
      <p>${escapeHtml(h.form.hint)}</p>
      <label>${escapeHtml(h.form.name)}<input name="name" autocomplete="name" required maxlength="100"></label>
      <label>${escapeHtml(h.form.email)}<input type="email" name="email" autocomplete="email" required maxlength="120"></label>
      <label>${escapeHtml(h.form.phone)}<input type="tel" name="phone" autocomplete="tel" maxlength="30"></label>
      <label>${escapeHtml(h.form.company)}<input name="company" autocomplete="organization" required maxlength="120"></label>
      <label>${escapeHtml(h.form.team)}<select name="team-size" required>${optionTags(ui.teamOptions, ui.select)}</select></label>
      <label>${escapeHtml(h.form.type)}<select name="project-type" required>${optionTags(ui.projectOptions, ui.select)}</select></label>
      <label class="full">${escapeHtml(h.form.timeline)}<select name="timeline" required>${optionTags(ui.timelineOptions, ui.select)}</select></label>
      <label class="full">${escapeHtml(h.form.brief)}<textarea name="brief" rows="5" maxlength="2000"></textarea></label>
      <label class="honeypot">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <label class="checkbox full"><input type="checkbox" name="consent" required><span>${escapeHtml(h.form.consent)} <a href="${legalPath(lang)}#privacy">${escapeHtml(ui.legalInfo)}</a></span></label>
      <button class="button button-primary full" type="submit" data-submit-label="${escapeHtml(h.form.submit)}" data-sending-label="${escapeHtml(h.form.sending)}">${escapeHtml(h.form.submit)}</button>
      <p class="form-status full" role="status" aria-live="polite" data-success="${escapeHtml(h.form.success)}" data-error="${escapeHtml(h.form.error)}"></p>
    </form>
  </div>
</section>`;

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pamuuc Studio",
      legalName: "PAMUUC ORGANIC CLOTHING S.L.",
      url: `${BASE_URL}/`,
      logo: absolute("/favicon.png"),
      email: "info@pamuuc.com",
      taxID: "B0541782"
    },
    {
      "@context": "https://schema.org",
      "@type": "ProfessionalService",
      name: "Pamuuc Studio",
      url: BASE_URL,
      serviceType: "Custom uniform design and workwear development",
      areaServed: "Europe",
      description: h.description
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Pamuuc Studio",
      url: BASE_URL,
      inLanguage: languageOrder
    }
  ];

  return pageLayout({ lang, routePath: homePath(lang), title: h.title, description: h.description, alternates, pageType: "home", bodyClass: "home-page", main, schema, image: "/assets/images/social-home-preview.jpg", imageAlt: "Pamuuc Studio custom uniform systems" });
}

function extractBlogContent(oldPath) {
  const html = readText(oldPath);
  const match = html.match(/<div class="blog-content">([\s\S]*?)<\/div>\s*<section aria-labelledby="related-articles"/);
  if (!match) {
    throw new Error(`Could not extract blog content from ${oldPath}`);
  }
  return `<div class="blog-content">${match[1]}</div>`;
}

function renderBlogIndex(lang) {
  const l = languages[lang];
  const ui = uiText[lang];
  const alternates = blogIndexAlternates();
  const cards = Object.entries(blogTopics)
    .map(([key, topic]) => {
      const data = topic.data[lang];
      return `<article class="blog-card reveal">
        <a href="${data.path}">
          <img src="/assets/images/blog/${topic.image}" alt="${escapeHtml(data.alt)}" width="760" height="540" loading="lazy">
          <div>
            <p><time datetime="${topic.date}">${topic.dateDisplay[lang]}</time></p>
            <h2>${escapeHtml(data.title)}</h2>
            <p>${escapeHtml(data.description)}</p>
          </div>
        </a>
      </article>`;
    })
    .join("\n");
  const main = `<section class="section blog-index">
  <div class="container blog-shell">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="${homePath(lang)}">Pamuuc Studio</a><span>/</span><span>${escapeHtml(l.nav.blog)}</span></nav>
    <header class="section-heading narrow reveal">
      <p class="eyebrow">${escapeHtml(ui.editorial)}</p>
      <h1>${escapeHtml(l.blogTitle)}</h1>
      <p>${escapeHtml(l.blogDescription)}</p>
    </header>
    <div class="blog-grid">${cards}</div>
  </div>
</section>`;
  const schema = [
    { "@context": "https://schema.org", "@type": "Blog", name: l.blogTitle, description: l.blogDescription, url: absolute(blogPath(lang)), inLanguage: lang },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: l.blogTitle,
      itemListElement: Object.entries(blogTopics).map(([key, topic], index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absolute(topic.data[lang].path),
        name: topic.data[lang].title
      }))
    },
    breadcrumbSchema([
      ["Pamuuc Studio", homePath(lang)],
      [l.nav.blog, blogPath(lang)]
    ])
  ];
  return pageLayout({ lang, routePath: blogPath(lang), title: l.blogTitle, description: l.blogDescription, alternates, pageType: "blog", bodyClass: "blog-page", main, schema, imageAlt: "Custom hospitality uniforms case study" });
}

function renderBlogPost(lang, topicKey) {
  const l = languages[lang];
  const topic = blogTopics[topicKey];
  const data = topic.data[lang];
  const content = extractBlogContent(data.old);
  const alternates = articleAlternates(topicKey);
  const related = Object.entries(blogTopics)
    .filter(([key]) => key !== topicKey)
    .map(([key, item]) => `<a class="related-link" href="${item.data[lang].path}">${escapeHtml(item.data[lang].title)}</a>`)
    .join("");
  const main = `<article class="section article-page">
  <div class="container article-shell">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="${homePath(lang)}">Pamuuc Studio</a><span>/</span><a href="${blogPath(lang)}">${escapeHtml(l.nav.blog)}</a></nav>
    <header class="article-header reveal">
      <p class="eyebrow">${escapeHtml(data.kicker)}</p>
      <h1>${escapeHtml(data.title)}</h1>
      <p class="article-meta"><time datetime="${topic.date}">${topic.dateDisplay[lang]}</time> · ${escapeHtml(topic.author)}</p>
    </header>
    <figure class="article-cover reveal">
      <img src="/assets/images/blog/${topic.image}" alt="${escapeHtml(data.alt)}" width="1200" height="850" fetchpriority="high">
    </figure>
    ${content}
    <aside class="article-cta">
      <h2>${escapeHtml(l.home.contactTitle)}</h2>
      <p>${escapeHtml(l.home.contactLead)}</p>
      <a class="button button-primary" href="${homePath(lang)}#contact">${escapeHtml(l.home.primaryCta)}</a>
    </aside>
    <nav class="related" aria-label="Related articles">${related}</nav>
  </div>
</article>`;
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: data.title,
      description: data.description,
      image: absolute(`/assets/images/blog/${topic.image}`),
      datePublished: topic.date,
      dateModified: topic.date,
      author: { "@type": "Organization", name: "Pamuuc Studio" },
      publisher: { "@type": "Organization", name: "Pamuuc Studio", logo: { "@type": "ImageObject", url: absolute("/favicon.png") } },
      mainEntityOfPage: absolute(data.path),
      inLanguage: lang
    },
    breadcrumbSchema([
      ["Pamuuc Studio", homePath(lang)],
      [l.nav.blog, blogPath(lang)],
      [data.title, data.path]
    ])
  ];
  return pageLayout({ lang, routePath: data.path, title: `${data.title} | Pamuuc Studio`, description: data.description, alternates, pageType: "blog-post", bodyClass: "article-page-body", main, schema, image: `/assets/images/blog/${topic.image}`, imageAlt: data.alt });
}

function extractLegalArticle(lang, id, slug) {
  const oldPath = routeForLegalSource(lang, slug);
  const html = readText(oldPath);
  const match = html.match(/<article class="legal-card">([\s\S]*?)<\/article>/);
  if (!match) {
    throw new Error(`Could not extract legal article from ${oldPath}`);
  }
  const inner = match[1]
    .replace(/<h1>([\s\S]*?)<\/h1>/, `<h2>$1</h2>`)
    .replaceAll("privacy-policy/", `${legalPath(lang)}#privacy`)
    .replaceAll("cookie-policy/", `${legalPath(lang)}#cookies`)
    .replaceAll("terms-and-conditions/", `${legalPath(lang)}#terms`)
    .replaceAll("legal-notice/", `${legalPath(lang)}#legal-notice`);
  return `<section class="legal-block" id="${id}">${inner}</section>`;
}

function renderLegal(lang) {
  const l = languages[lang];
  const ui = uiText[lang];
  const alternates = legalAlternates();
  const blocks = legalSlugs.map(([id, slug]) => extractLegalArticle(lang, id, slug)).join("\n");
  const main = `<section class="section legal-page">
  <div class="container legal-shell">
    <header class="section-heading narrow reveal">
      <p class="eyebrow">Pamuuc Studio</p>
      <h1>${escapeHtml(l.legalTitle)}</h1>
      <p>${escapeHtml(l.legalDescription)}</p>
    </header>
    <nav class="legal-nav" aria-label="Legal sections">
      <a href="#privacy">${escapeHtml(ui.legal.privacy)}</a>
      <a href="#cookies">${escapeHtml(ui.legal.cookies)}</a>
      <a href="#terms">${escapeHtml(ui.legal.terms)}</a>
      <a href="#legal-notice">${escapeHtml(ui.legal.notice)}</a>
    </nav>
    ${blocks}
  </div>
</section>`;
  return pageLayout({ lang, routePath: legalPath(lang), title: `${l.legalTitle} | Pamuuc Studio`, description: l.legalDescription, robots: "noindex,follow,max-image-preview:large", alternates, pageType: "legal", bodyClass: "legal-page-body", main });
}

function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, routePath], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: absolute(routePath)
    }))
  };
}

function render404() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | Pamuuc Studio</title>
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${BASE_URL}/">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body class="not-found">
<main class="section">
  <div class="container section-heading narrow">
    <p class="eyebrow">Pamuuc Studio</p>
    <h1>Page not found</h1>
    <p>The page you are looking for is not available.</p>
    <a class="button button-primary" href="/">Return home</a>
  </div>
</main>
</body>
</html>`;
}

const siteCss = `@font-face {
  font-family: "Gilmer";
  src: url("/assets/fonts/Gilmer-Light.woff") format("woff");
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Gilmer";
  src: url("/assets/fonts/Gilmer-Regular.woff") format("woff");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Gilmer";
  src: url("/assets/fonts/Gilmer-Bold.woff") format("woff");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Gilmer";
  src: url("/assets/fonts/Gilmer-Heavy.woff") format("woff");
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}
:root {
  --bg: #fbf7ef;
  --paper: #fffdf8;
  --ink: #1a1714;
  --muted: #6b6560;
  --line: rgba(26, 23, 20, 0.12);
  --green: #002b2a;
  --green-soft: #e4eeeb;
  --red: #7f1d16;
  --max: 1180px;
  --gutter: 24px;
  --radius: 8px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: "Gilmer", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.58;
}
img { display: block; max-width: 100%; height: auto; }
a { color: inherit; text-decoration: none; }
p, h1, h2, h3 { margin: 0; }
h1, h2, h3 { line-height: 1.05; letter-spacing: 0; }
h1 { font-size: 5rem; }
h2 { font-size: 2.6rem; }
h3 { font-size: 1.18rem; }
p { color: var(--muted); }
.container { width: min(var(--max), calc(100% - (var(--gutter) * 2))); margin: 0 auto; }
.skip-link { position: fixed; left: 12px; top: 12px; transform: translateY(-150%); background: var(--green); color: white; padding: 10px 14px; z-index: 100; border-radius: var(--radius); }
.skip-link:focus { transform: translateY(0); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(251, 247, 239, 0.94);
  border-bottom: 1px solid var(--line);
}
.header-inner { min-height: 76px; display: flex; align-items: center; gap: 22px; }
.brand img { width: 190px; height: auto; }
.site-nav { margin-left: auto; display: flex; align-items: center; gap: 20px; color: var(--muted); font-weight: 600; font-size: 0.92rem; }
.nav-cta, .button { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 18px; border-radius: 999px; border: 1px solid var(--line); font-weight: 700; }
.nav-cta { color: var(--ink); background: var(--paper); }
.language-switcher { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--line); padding: 4px; border-radius: 999px; background: rgba(255, 253, 248, 0.72); }
.lang-link { min-width: 34px; min-height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; color: var(--muted); font-size: 0.78rem; font-weight: 800; }
.lang-link.is-active { background: var(--green); color: #fff; }
.menu-toggle { display: none; width: 44px; height: 44px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper); }
.menu-toggle span:not(.sr-only) { display: block; width: 18px; height: 2px; margin: 4px auto; background: var(--green); }
.hero { position: relative; min-height: calc(94svh - 76px); overflow: hidden; background: var(--green); display: grid; align-items: end; }
.hero-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.72; }
.hero-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0, 43, 42, 0.93), rgba(0, 43, 42, 0.58) 44%, rgba(0, 43, 42, 0.16)); }
.hero-inner { position: relative; padding: 110px 0 70px; max-width: 860px; margin-left: max(var(--gutter), calc((100vw - var(--max)) / 2)); }
.eyebrow { color: var(--red); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 16px; }
.hero .eyebrow { color: rgba(240, 194, 184, 0.9); }
.hero h1 { color: #fff; margin-bottom: 18px; }
.hero-statement { color: rgba(255,255,255,0.92); font-size: 1.65rem; max-width: 760px; line-height: 1.22; }
.hero-lead { color: rgba(255,255,255,0.68); max-width: 640px; margin-top: 22px; font-size: 1.08rem; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 36px; }
.button-primary { background: var(--red); color: #fff; border-color: var(--red); }
.button-secondary { background: transparent; color: var(--ink); border-color: var(--line); }
.button-light { color: #fff; border-color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.07); }
.proof-strip { background: var(--green); color: #fff; }
.proof-strip-inner { display: grid; grid-template-columns: repeat(4, 1fr); border-left: 1px solid rgba(255,255,255,0.16); }
.proof-strip span { padding: 20px 22px; border-right: 1px solid rgba(255,255,255,0.16); color: rgba(255,255,255,0.86); font-weight: 700; font-size: 0.92rem; }
.section { padding: 104px 0; }
.section-tint { background: var(--paper); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.two-column { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 64px; align-items: start; }
.section-heading h2, .section-heading h1 { margin-bottom: 18px; }
.section-heading p { max-width: 680px; font-size: 1.06rem; }
.section-heading.narrow { max-width: 760px; text-align: center; }
.lead-stack { display: grid; gap: 18px; font-size: 1.08rem; }
.offer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 42px; }
.quiet-card, .timeline-step, .fact, .team-row, details, .article-cta {
  border: 1px solid var(--line);
  background: rgba(255, 253, 248, 0.72);
  border-radius: var(--radius);
  padding: 24px;
}
.quiet-card h3, .timeline-step h3, .team-row h3, .fact strong { margin-bottom: 10px; display: block; }
.sector-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 34px; }
.sector-grid span { border: 1px solid var(--line); border-radius: 999px; padding: 14px 18px; background: var(--green-soft); font-weight: 700; }
.timeline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 42px; }
.timeline-step span { color: var(--red); font-weight: 900; display: block; margin-bottom: 36px; }
.production-section { background: var(--green); color: #fff; }
.production-section p, .production-section .eyebrow { color: rgba(255,255,255,0.76); }
.production-section h2 { color: #fff; }
.facts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.fact { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); }
.fact strong { color: #fff; font-size: 1.3rem; }
.fact span { color: rgba(255,255,255,0.76); }
.editorial-grid, .blog-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 42px; }
.editorial-card, .blog-card { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.editorial-card a, .blog-card a { display: grid; height: 100%; }
.editorial-card img, .blog-card img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
.editorial-card span, .editorial-card h3, .editorial-card p, .blog-card div { margin: 0 22px; }
.editorial-card span { color: var(--red); font-size: 0.78rem; text-transform: uppercase; font-weight: 800; margin-top: 22px; }
.editorial-card h3 { margin-top: 10px; }
.editorial-card p { margin-top: 12px; margin-bottom: 24px; }
.blog-card div { margin-top: 22px; margin-bottom: 24px; }
.blog-card h2 { font-size: 1.22rem; margin: 8px 0 10px; }
.team-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.faq-list { display: grid; gap: 12px; }
.team-card { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--paper); }
.team-photo { width: 100%; aspect-ratio: 1; object-fit: cover; background: var(--green-soft); }
.team-body { padding: 22px 24px 26px; }
.team-body h3 { margin-bottom: 6px; font-size: 1.05rem; }
.role { color: var(--red); font-weight: 800; font-size: 0.85rem; margin: 0 0 12px; }
details { padding: 0; }
summary { cursor: pointer; padding: 20px 22px; font-weight: 800; }
details p { padding: 0 22px 22px; }
.contact-section { background: var(--green-soft); border-top: 1px solid var(--line); }
.contact-layout { display: grid; grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr); gap: 42px; align-items: start; }
.contact-copy { position: sticky; top: 110px; }
.contact-copy h2 { margin-bottom: 18px; }
.contact-copy .button { margin-top: 26px; }
.contact-form { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 28px; }
.contact-form > p, .contact-form .full { grid-column: 1 / -1; }
label { display: grid; gap: 7px; font-weight: 800; color: var(--ink); }
input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: var(--radius); background: #fff; min-height: 46px; padding: 10px 12px; font: inherit; color: var(--ink); }
textarea { resize: vertical; }
.checkbox { grid-template-columns: 18px 1fr; align-items: start; font-weight: 600; }
.checkbox input { min-height: 18px; margin-top: 4px; }
.checkbox a { text-decoration: underline; }
.honeypot { position: absolute; left: -10000px; }
.form-status { min-height: 24px; font-weight: 800; color: var(--red); }
.site-footer { padding: 54px 0 30px; border-top: 1px solid var(--line); background: var(--paper); }
.footer-inner { display: grid; grid-template-columns: 1.6fr 0.8fr 0.8fr auto; gap: 28px; align-items: start; }
.footer-brand img { width: 170px; margin-bottom: 14px; }
.footer-links { display: grid; gap: 8px; color: var(--muted); font-weight: 700; }
.copyright { width: min(var(--max), calc(100% - (var(--gutter) * 2))); margin: 30px auto 0; font-size: 0.85rem; }
.cookie-banner { position: fixed; left: 18px; right: 18px; bottom: 18px; z-index: 70; width: min(560px, calc(100% - 36px)); background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px 22px; box-shadow: 0 8px 48px rgba(26,23,20,0.14); }
.cookie-banner p { color: var(--muted); margin-bottom: 16px; font-size: 0.92rem; }
.cookie-actions { display: flex; gap: 10px; }
.cookie-btn { flex: 1; min-height: 42px; border-radius: 999px; font: inherit; font-size: 0.88rem; font-weight: 700; cursor: pointer; border: 1px solid var(--line); }
.cookie-btn-accept { background: var(--green); color: #fff; border-color: var(--green); }
.cookie-btn-reject { background: transparent; color: var(--muted); }
.blog-index, .article-page, .legal-page { padding-top: 56px; }
.blog-shell, .article-shell, .legal-shell { max-width: 980px; }
.breadcrumb { display: flex; gap: 8px; color: var(--muted); font-weight: 700; margin-bottom: 44px; }
.article-header { max-width: 880px; }
.article-header h1 { font-size: 3.1rem; margin-bottom: 16px; }
.article-meta { font-weight: 700; }
.article-cover { margin: 34px 0; }
.article-cover img { width: 100%; border-radius: var(--radius); aspect-ratio: 16 / 10; object-fit: cover; }
.blog-content { max-width: 760px; margin: 0 auto; display: grid; gap: 20px; }
.blog-content h2 { font-size: 1.7rem; margin-top: 28px; }
.blog-content p, .blog-content li { font-size: 1.05rem; }
.article-cta { max-width: 760px; margin: 54px auto 24px; background: var(--green); color: #fff; }
.article-cta p { color: rgba(255,255,255,0.72); margin: 12px 0 22px; }
.related { max-width: 760px; margin: 0 auto; display: grid; gap: 10px; }
.related-link { border-bottom: 1px solid var(--line); padding: 14px 0; font-weight: 800; }
.legal-nav { display: flex; flex-wrap: wrap; gap: 10px; margin: 28px 0 38px; }
.legal-nav a { border: 1px solid var(--line); border-radius: 999px; padding: 10px 14px; font-weight: 800; }
.legal-block { border-top: 1px solid var(--line); padding-top: 44px; margin-top: 44px; display: grid; gap: 18px; }
.legal-block h2 { font-size: 2rem; margin-top: 12px; }
.legal-block h3 { font-size: 1.25rem; }
.legal-block ul { color: var(--muted); }
.reveal { opacity: 0; transform: translateY(18px); transition: opacity 520ms ease, transform 520ms ease; }
.reveal.is-visible { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .reveal { opacity: 1; transform: none; transition: none; }
}
@media (max-width: 1020px) {
  h1 { font-size: 3.7rem; }
  h2 { font-size: 2.2rem; }
  .menu-toggle { display: block; margin-left: auto; }
  .site-nav { display: none; position: absolute; left: 0; right: 0; top: 76px; padding: 18px var(--gutter); background: var(--paper); border-bottom: 1px solid var(--line); }
  .site-nav.is-open { display: grid; }
  .header-inner > .language-switcher { display: none; }
  .two-column, .contact-layout { grid-template-columns: 1fr; gap: 32px; }
  .offer-grid, .editorial-grid, .blog-grid { grid-template-columns: 1fr 1fr; }
  .timeline, .proof-strip-inner { grid-template-columns: 1fr 1fr; }
  .team-list { grid-template-columns: 1fr 1fr; }
  .contact-copy { position: static; }
  .footer-inner { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 680px) {
  :root { --gutter: 18px; }
  h1 { font-size: 2.75rem; }
  h2 { font-size: 1.9rem; }
  .brand img { width: 154px; }
  .hero { min-height: 86svh; }
  .hero-scrim { background: linear-gradient(0deg, rgba(0, 43, 42, 0.97), rgba(0, 43, 42, 0.48)); }
  .hero-inner { padding: 72px 0 42px; margin-left: var(--gutter); width: calc(100% - (var(--gutter) * 2)); }
  .hero-statement { font-size: 1.22rem; }
  .hero-actions, .hero-actions .button { width: 100%; }
  .proof-strip-inner, .offer-grid, .sector-grid, .timeline, .facts-grid, .editorial-grid, .blog-grid, .contact-form, .footer-inner, .team-list { grid-template-columns: 1fr; }
  .section { padding: 72px 0; }
  .contact-form { padding: 20px; }
  .article-header h1 { font-size: 2.18rem; }
  .footer-inner .language-switcher { justify-self: start; }
}`;

const siteJs = `(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });
  }

  const revealItems = document.querySelectorAll(".reveal");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    revealItems.forEach((item) => observer.observe(item));
  }

  function loadGA4() {
    if (document.querySelector('script[data-ga4]')) return;
    const s = document.createElement("script");
    s.dataset.ga4 = "1";
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=${GA4_ID}";
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", "${GA4_ID}", { anonymize_ip: true });
  }

  const consent = localStorage.getItem("pamuuc_analytics");
  if (consent === "accepted") loadGA4();

  const banner = document.querySelector("[data-cookie-banner]");
  if (banner && !consent) {
    banner.hidden = false;
    banner.querySelector("[data-cookie-accept]")?.addEventListener("click", () => {
      localStorage.setItem("pamuuc_analytics", "accepted");
      banner.hidden = true;
      loadGA4();
    });
    banner.querySelector("[data-cookie-reject]")?.addEventListener("click", () => {
      localStorage.setItem("pamuuc_analytics", "rejected");
      banner.hidden = true;
    });
  }

  document.querySelectorAll("[data-contact-form]").forEach((form) => {
    const button = form.querySelector("button[type='submit']");
    const status = form.querySelector(".form-status");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const source = new FormData(form);
      if (String(source.get("website") || "").trim()) {
        return;
      }
      const payload = new FormData();
      payload.set("Full name", String(source.get("name") || "").trim());
      payload.set("Work email", String(source.get("email") || "").trim());
      payload.set("Phone number", String(source.get("phone") || "").trim());
      payload.set("Company", String(source.get("company") || "").trim());
      payload.set("Team size", String(source.get("team-size") || "").trim());
      payload.set("Project type", String(source.get("project-type") || "").trim());
      payload.set("Target timeline", String(source.get("timeline") || "").trim());
      payload.set("Project brief", String(source.get("brief") || "").trim());
      payload.set("Privacy consent", "Accepted");
      payload.set("Language", document.body.dataset.language || "en");
      payload.set("Source page", window.location.href);
      payload.set("_subject", "New Pamuuc Studio project request");
      payload.set("_replyto", String(source.get("email") || "").trim());

      const original = button?.dataset.submitLabel || button?.textContent || "Submit";
      if (button) {
        button.disabled = true;
        button.textContent = button.dataset.sendingLabel || "Sending...";
      }
      if (status) status.textContent = "";

      try {
        const response = await fetch(form.action, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: payload,
          credentials: "omit",
          cache: "no-store"
        });
        if (!response.ok) throw new Error("Form request failed");
        form.reset();
        if (status) status.textContent = status.dataset.success || "Sent.";
      } catch (error) {
        if (status) status.textContent = status.dataset.error || "Could not send.";
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = original;
        }
      }
    });
  });
})();`;

function writeStaticAssets() {
  writeAsset("assets/css/site.css", siteCss);
  writeAsset("assets/js/site.js", siteJs);
  copyAsset("assets/images/logo.png", "assets/images/logo.png");
  for (const f of ["team-leonardo.svg", "team-federica.svg", "team-andreas.svg"]) {
    const src = path.join(ROOT, "assets/images", f);
    if (fs.existsSync(src)) copyAsset(`assets/images/${f}`, `assets/images/${f}`);
  }
  copyAsset("assets/images/social-home-preview.jpg", "assets/images/social-home-preview.jpg");
  copyAsset("assets/images/blog/custom-hospitality-uniforms.jpg", "assets/images/hero.jpg");
  for (const topic of Object.values(blogTopics)) {
    copyAsset(`assets/images/blog/${topic.image}`, `assets/images/blog/${topic.image}`);
  }
  if (fs.existsSync(path.join(ROOT, "CNAME"))) copyAsset("CNAME", "CNAME");
  if (fs.existsSync(path.join(ROOT, ".well-known/security.txt"))) copyAsset(".well-known/security.txt", ".well-known/security.txt");
  writeAsset(".nojekyll", "");
  writeAsset("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`);
}

function writeSitemap(indexableRoutes) {
  const body = indexableRoutes
    .map((routePath) => `  <url><loc>${absolute(routePath)}</loc><lastmod>${LASTMOD}</lastmod></url>`)
    .join("\n");
  writeAsset("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
}

function validateDist(indexableRoutes) {
  const errors = [];
  for (const routePath of indexableRoutes) {
    const file = filePathFor(routePath);
    if (!fs.existsSync(file)) errors.push(`Missing indexable page ${routePath}`);
    const html = fs.readFileSync(file, "utf8");
    if (html.includes("noindex")) errors.push(`Indexable page has noindex: ${routePath}`);
    for (const lang of [...languageOrder, "x-default"]) {
      if (!html.includes(`hreflang="${lang}"`)) errors.push(`Missing hreflang ${lang}: ${routePath}`);
    }
    if (!html.includes(`<link rel="canonical" href="${absolute(routePath)}">`)) errors.push(`Canonical mismatch: ${routePath}`);
  }

  const sitemap = fs.readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
  const locCount = (sitemap.match(/<loc>/g) || []).length;
  if (locCount !== indexableRoutes.length) errors.push(`Sitemap has ${locCount} URLs, expected ${indexableRoutes.length}`);
  for (const blocked of ["privacy-policy", "cookie-policy", "terms-and-conditions", "legal-notice", "/legal/"]) {
    if (sitemap.includes(blocked)) errors.push(`Sitemap includes non-indexable route containing ${blocked}`);
  }
  if (sitemap.includes(`${BASE_URL}/en/</loc>`)) errors.push("Sitemap includes /en/ duplicate");

  const allHtml = [];
  const collect = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) collect(full);
      if (item.isFile() && item.name.endsWith(".html")) allHtml.push(full);
    }
  };
  collect(DIST);
  for (const file of allHtml) {
    const html = fs.readFileSync(file, "utf8");
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    for (const href of links) {
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      const [clean] = href.split("#");
      if (!clean || clean === "/sitemap.xml" || clean.endsWith(".svg") || clean.endsWith(".png") || clean.endsWith(".jpg") || clean.endsWith(".css") || clean.endsWith(".js") || clean.endsWith(".woff") || clean.endsWith(".woff2")) continue;
      const target = clean === "/" ? path.join(DIST, "index.html") : path.join(DIST, clean.slice(1), "index.html");
      if (!fs.existsSync(target)) errors.push(`Broken internal link ${href} in ${path.relative(DIST, file)}`);
    }
  }

  if (errors.length) {
    throw new Error(`Dist validation failed:\n${errors.join("\n")}`);
  }
}

async function main() {
  cleanDist();

  console.log("Downloading Gilmer fonts and favicon…");
  await Promise.all([
    ...GILMER_FONTS.map((f) => downloadFont(f.url, `assets/fonts/${f.file}`)),
    downloadFont(FAVICON_URL, "favicon.png"),
  ]);
  console.log("Fonts and favicon downloaded.");

  const indexableRoutes = [];

  for (const lang of languageOrder) {
    writeFile(homePath(lang), renderHome(lang));
    indexableRoutes.push(homePath(lang));
  }

  for (const lang of languageOrder) {
    writeFile(blogPath(lang), renderBlogIndex(lang));
    indexableRoutes.push(blogPath(lang));
  }

  for (const lang of languageOrder) {
    for (const key of Object.keys(blogTopics)) {
      const routePath = blogTopics[key].data[lang].path;
      writeFile(routePath, renderBlogPost(lang, key));
      indexableRoutes.push(routePath);
    }
  }

  for (const lang of languageOrder) {
    writeFile(legalPath(lang), renderLegal(lang));
  }

  writeAsset("404.html", render404());
  writeStaticAssets();
  writeSitemap(indexableRoutes);
  validateDist(indexableRoutes);

  console.log(`Built ${indexableRoutes.length} indexable URLs and ${languageOrder.length} noindex legal hubs in dist/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
