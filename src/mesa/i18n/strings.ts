import type { LanguageCode } from './languages'

export interface StringDict {
  welcomeTitle: string
  welcomeSubtitle: string
  loadingTables: string
  sidebarTagline: string
  navFeatured: string
  tableLabel: string
  changeTable: string
  greetingTitle: string
  greetingSubtitle: string
  kitchenNotice: string
  loadingMenu: string
  errorMenuPrefix: string
  noItemsInCategory: string
  seeFullMenu: string
  modalClose: string
  badgeRequired: string
  badgeOptional: string
  observationLabel: string
  observationPlaceholder: string
  quantityLabel: string
  decreaseQty: string
  increaseQty: string
  selectOptionIn: string
  addToCartPrefix: string
  cartTitle: string
  cartEmptyLine1: string
  cartEmptyLine2: string
  obsPrefix: string
  removeItem: string
  totalLabel: string
  sending: string
  checkoutButton: string
  confirmationTitle: string
  confirmationBody: string
  newOrderButton: string
  genericOrderError: string
  languageLabel: string
}

export type StringKey = keyof StringDict

export const STRINGS: Record<LanguageCode, StringDict> = {
  de: {
    welcomeTitle: 'Willkommen!',
    welcomeSubtitle: 'Tippe auf deine Tischnummer, um zu beginnen',
    loadingTables: 'Tische werden geladen…',
    sidebarTagline: 'Der Geschmack Brasiliens in der Schweiz',
    navFeatured: 'Empfehlungen',
    tableLabel: 'Tisch',
    changeTable: 'Wechseln',
    greetingTitle: 'Hallo! Worauf hast du heute Lust?',
    greetingSubtitle: 'Stelle es dir selbst zusammen oder wähle eine unserer Optionen',
    kitchenNotice: 'Bestellungen werden direkt an die Küche gesendet',
    loadingMenu: 'Speisekarte wird geladen…',
    errorMenuPrefix: 'Fehler beim Laden der Speisekarte: ',
    noItemsInCategory: 'Keine Artikel in dieser Kategorie.',
    seeFullMenu: 'Ganze Speisekarte ansehen',
    modalClose: 'Schliessen',
    badgeRequired: 'Erforderlich',
    badgeOptional: 'Optional',
    observationLabel: 'Eine Anmerkung?',
    observationPlaceholder: 'Z. B. ohne Zwiebeln, gut durch, Erdnussallergie…',
    quantityLabel: 'Menge',
    decreaseQty: 'Menge verringern',
    increaseQty: 'Menge erhöhen',
    selectOptionIn: 'Bitte wähle eine Option bei: ',
    addToCartPrefix: 'Hinzufügen — ',
    cartTitle: 'Meine Bestellung',
    cartEmptyLine1: 'Dein Warenkorb ist leer.',
    cartEmptyLine2: 'Tippe auf einen Artikel, um ihn hinzuzufügen.',
    obsPrefix: 'Anm.: ',
    removeItem: 'Artikel entfernen',
    totalLabel: 'Total',
    sending: 'Wird gesendet…',
    checkoutButton: 'Bestellung abschicken',
    confirmationTitle: 'Bestellung gesendet!',
    confirmationBody:
      'Deine Bestellung ist in der Küche von Tisch {numero} angekommen. Unser Team beginnt in Kürze mit der Zubereitung.',
    newOrderButton: 'Weitere Bestellung aufgeben',
    genericOrderError: 'Die Bestellung konnte nicht erstellt werden.',
    languageLabel: 'Sprache',
  },
  fr: {
    welcomeTitle: 'Bienvenue !',
    welcomeSubtitle: 'Touchez le numéro de votre table pour commencer',
    loadingTables: 'Chargement des tables…',
    sidebarTagline: 'Le goût du Brésil en Suisse',
    navFeatured: 'Nos coups de cœur',
    tableLabel: 'Table',
    changeTable: 'Changer',
    greetingTitle: "Bonjour ! Qu'est-ce que ce sera aujourd'hui ?",
    greetingSubtitle: "Composez à votre façon ou choisissez l'une de nos options",
    kitchenNotice: 'Les commandes passées ici sont envoyées directement en cuisine',
    loadingMenu: 'Chargement du menu…',
    errorMenuPrefix: 'Erreur lors du chargement du menu : ',
    noItemsInCategory: 'Aucun article dans cette catégorie.',
    seeFullMenu: 'Voir tout le menu',
    modalClose: 'Fermer',
    badgeRequired: 'Obligatoire',
    badgeOptional: 'Optionnel',
    observationLabel: 'Une remarque ?',
    observationPlaceholder: 'Ex. : sans oignon, bien cuit, allergie aux arachides…',
    quantityLabel: 'Quantité',
    decreaseQty: 'Diminuer la quantité',
    increaseQty: 'Augmenter la quantité',
    selectOptionIn: 'Sélectionnez une option dans : ',
    addToCartPrefix: 'Ajouter — ',
    cartTitle: 'Ma commande',
    cartEmptyLine1: 'Votre panier est vide.',
    cartEmptyLine2: "Touchez un article pour l'ajouter.",
    obsPrefix: 'Remarque : ',
    removeItem: "Retirer l'article",
    totalLabel: 'Total',
    sending: 'Envoi…',
    checkoutButton: 'Valider la commande',
    confirmationTitle: 'Commande envoyée !',
    confirmationBody:
      'Votre commande est arrivée en cuisine pour la table {numero}. Notre équipe va bientôt commencer la préparation.',
    newOrderButton: 'Passer une autre commande',
    genericOrderError: 'Impossible de créer la commande.',
    languageLabel: 'Langue',
  },
  it: {
    welcomeTitle: 'Benvenuto!',
    welcomeSubtitle: 'Tocca il numero del tuo tavolo per iniziare',
    loadingTables: 'Caricamento tavoli…',
    sidebarTagline: 'Il sapore del Brasile in Svizzera',
    navFeatured: 'In evidenza',
    tableLabel: 'Tavolo',
    changeTable: 'Cambia',
    greetingTitle: 'Ciao! Cosa ti va oggi?',
    greetingSubtitle: 'Componi a modo tuo o scegli una delle nostre proposte',
    kitchenNotice: 'Gli ordini effettuati qui vengono inviati direttamente in cucina',
    loadingMenu: 'Caricamento del menu…',
    errorMenuPrefix: 'Errore nel caricamento del menu: ',
    noItemsInCategory: 'Nessun articolo in questa categoria.',
    seeFullMenu: 'Vedi il menu completo',
    modalClose: 'Chiudi',
    badgeRequired: 'Obbligatorio',
    badgeOptional: 'Facoltativo',
    observationLabel: 'Qualche indicazione?',
    observationPlaceholder: 'Es. senza cipolla, ben cotto, allergia alle arachidi…',
    quantityLabel: 'Quantità',
    decreaseQty: 'Diminuisci quantità',
    increaseQty: 'Aumenta quantità',
    selectOptionIn: "Seleziona un'opzione in: ",
    addToCartPrefix: 'Aggiungi — ',
    cartTitle: 'Il mio ordine',
    cartEmptyLine1: 'Il tuo carrello è vuoto.',
    cartEmptyLine2: 'Tocca un articolo per aggiungerlo.',
    obsPrefix: 'Nota: ',
    removeItem: 'Rimuovi articolo',
    totalLabel: 'Totale',
    sending: 'Invio in corso…',
    checkoutButton: 'Invia ordine',
    confirmationTitle: 'Ordine inviato!',
    confirmationBody:
      'Il tuo ordine è arrivato in cucina per il tavolo {numero}. Il nostro team inizierà a breve la preparazione.',
    newOrderButton: 'Fai un altro ordine',
    genericOrderError: "Non è stato possibile creare l'ordine.",
    languageLabel: 'Lingua',
  },
  en: {
    welcomeTitle: 'Welcome!',
    welcomeSubtitle: 'Tap your table number to get started',
    loadingTables: 'Loading tables…',
    sidebarTagline: 'The taste of Brazil in Switzerland',
    navFeatured: 'Highlights',
    tableLabel: 'Table',
    changeTable: 'Change',
    greetingTitle: 'Hi! What will it be today?',
    greetingSubtitle: 'Build it your way or pick one of our options',
    kitchenNotice: 'Orders placed here are sent straight to the kitchen',
    loadingMenu: 'Loading menu…',
    errorMenuPrefix: 'Error loading menu: ',
    noItemsInCategory: 'No items in this category.',
    seeFullMenu: 'See full menu',
    modalClose: 'Close',
    badgeRequired: 'Required',
    badgeOptional: 'Optional',
    observationLabel: 'Any special request?',
    observationPlaceholder: 'E.g. no onion, well done, peanut allergy…',
    quantityLabel: 'Quantity',
    decreaseQty: 'Decrease quantity',
    increaseQty: 'Increase quantity',
    selectOptionIn: 'Please select an option in: ',
    addToCartPrefix: 'Add — ',
    cartTitle: 'My order',
    cartEmptyLine1: 'Your cart is empty.',
    cartEmptyLine2: 'Tap an item to add it.',
    obsPrefix: 'Note: ',
    removeItem: 'Remove item',
    totalLabel: 'Total',
    sending: 'Sending…',
    checkoutButton: 'Place order',
    confirmationTitle: 'Order sent!',
    confirmationBody:
      'Your order has reached the kitchen for table {numero}. Our team will start preparing it shortly.',
    newOrderButton: 'Place another order',
    genericOrderError: 'Could not create the order.',
    languageLabel: 'Language',
  },
  pt: {
    welcomeTitle: 'Bem-vindo!',
    welcomeSubtitle: 'Toque no número da sua mesa para começar',
    loadingTables: 'Carregando mesas…',
    sidebarTagline: 'O sabor do Brasil na Suíça',
    navFeatured: 'Destaques',
    tableLabel: 'Mesa',
    changeTable: 'Trocar',
    greetingTitle: 'Olá! O que vai ser hoje?',
    greetingSubtitle: 'Monte do seu jeito ou escolha uma das nossas opções',
    kitchenNotice: 'Pedidos feitos aqui são enviados direto para a cozinha',
    loadingMenu: 'Carregando cardápio…',
    errorMenuPrefix: 'Erro ao carregar cardápio: ',
    noItemsInCategory: 'Nenhum item nesta categoria.',
    seeFullMenu: 'Ver cardápio completo',
    modalClose: 'Fechar',
    badgeRequired: 'Obrigatório',
    badgeOptional: 'Opcional',
    observationLabel: 'Alguma observação?',
    observationPlaceholder: 'Ex: sem cebola, ponto bem passado, alergia a amendoim…',
    quantityLabel: 'Quantidade',
    decreaseQty: 'Diminuir quantidade',
    increaseQty: 'Aumentar quantidade',
    selectOptionIn: 'Selecione uma opção em: ',
    addToCartPrefix: 'Adicionar — ',
    cartTitle: 'Meu pedido',
    cartEmptyLine1: 'Seu carrinho está vazio.',
    cartEmptyLine2: 'Toque em um item para adicionar.',
    obsPrefix: 'Obs: ',
    removeItem: 'Remover item',
    totalLabel: 'Total',
    sending: 'Enviando…',
    checkoutButton: 'Finalizar pedido',
    confirmationTitle: 'Pedido enviado!',
    confirmationBody:
      'Seu pedido chegou na cozinha da Mesa {numero}. Em breve nossa equipe começa o preparo.',
    newOrderButton: 'Fazer outro pedido',
    genericOrderError: 'Não foi possível criar o pedido.',
    languageLabel: 'Idioma',
  },
  es: {
    welcomeTitle: '¡Bienvenido!',
    welcomeSubtitle: 'Toca el número de tu mesa para empezar',
    loadingTables: 'Cargando mesas…',
    sidebarTagline: 'El sabor de Brasil en Suiza',
    navFeatured: 'Destacados',
    tableLabel: 'Mesa',
    changeTable: 'Cambiar',
    greetingTitle: '¡Hola! ¿Qué va a ser hoy?',
    greetingSubtitle: 'Arma tu pedido a tu manera o elige una de nuestras opciones',
    kitchenNotice: 'Los pedidos hechos aquí se envían directo a la cocina',
    loadingMenu: 'Cargando menú…',
    errorMenuPrefix: 'Error al cargar el menú: ',
    noItemsInCategory: 'No hay artículos en esta categoría.',
    seeFullMenu: 'Ver menú completo',
    modalClose: 'Cerrar',
    badgeRequired: 'Obligatorio',
    badgeOptional: 'Opcional',
    observationLabel: '¿Alguna observación?',
    observationPlaceholder: 'Ej.: sin cebolla, bien cocido, alergia al maní…',
    quantityLabel: 'Cantidad',
    decreaseQty: 'Disminuir cantidad',
    increaseQty: 'Aumentar cantidad',
    selectOptionIn: 'Selecciona una opción en: ',
    addToCartPrefix: 'Añadir — ',
    cartTitle: 'Mi pedido',
    cartEmptyLine1: 'Tu carrito está vacío.',
    cartEmptyLine2: 'Toca un artículo para añadirlo.',
    obsPrefix: 'Nota: ',
    removeItem: 'Quitar artículo',
    totalLabel: 'Total',
    sending: 'Enviando…',
    checkoutButton: 'Finalizar pedido',
    confirmationTitle: '¡Pedido enviado!',
    confirmationBody:
      'Tu pedido llegó a la cocina de la mesa {numero}. Nuestro equipo comenzará la preparación en breve.',
    newOrderButton: 'Hacer otro pedido',
    genericOrderError: 'No se pudo crear el pedido.',
    languageLabel: 'Idioma',
  },
}
