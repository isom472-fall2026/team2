export const guideCopy = {
  tab: 'Pre-arrival guide',
  eyebrow: 'NEXT STOP · KUWAIT UNIVERSITY',
  title: 'A new place. A great start.',
  intro: 'Your guide to getting here, settling in, and making the most of your exchange at KU.',
  language: 'YOUR GUIDE IN ENGLISH',
  destination: 'KWI',
  destinationLabel: 'Kuwait · Your next chapter',
  essentials: [
    { icon: 'calendar', value: '1 week early', label: 'Plan your arrival' },
    { icon: 'home', value: 'Stay & meals', label: 'Provided free at KU' },
    { icon: 'bus', value: 'Airport pickup', label: 'Provided free by KU' },
  ],
  cycle: {
    title: 'Your semester at a glance', label: 'Explore a KU semester',
    starts: 'Semester starts', ends: 'Semester ends', arrival: 'Arrive one week before',
    loading: 'Loading KU semester dates…', empty: 'Semester dates have not been published yet. Contact the office before booking your flight.',
    error: 'Semester dates could not be loaded. You can still read the guide below.',
    retry: 'Try again', unset: 'Not published yet',
    note: 'Confirm your semester and travel plans with the exchange office before booking.',
  },
  search: { label: 'Find something in the guide', placeholder: 'Try “visa”, “meals”, or “credits”…', clear: 'Clear search', results: 'sections found', all: 'Explore all 6 sections', expand: 'Expand all', collapse: 'Collapse all', emptyTitle: 'A little detour.', empty: 'No sections match your search. Try a topic like visa, accommodation, or courses.', reset: 'Show the full guide' },
  contact: { title: 'A friendly place to ask.', text: 'Questions about your visa, accommodation, or getting here? The office can help.', email: 'Email the office', phone: 'Call the office', whatsapp: 'WhatsApp', address: 'oss@ku.edu.kw', number: '+965 2498 6247', tel: 'tel:+96524986247', chat: 'https://wa.me/96524986247' },
  credit: 'Pre-arrival information · KU Student Exchange Program',
}

export const guideSections = [
  {
    id: 'visa', icon: 'passport', title: 'Visa & embassy', subtitle: 'Your paperwork, one step at a time.', accent: 'gold',
    blocks: [
      { title: 'First, your acceptance letter', text: 'Conditional acceptance follows approval of your incoming application. Unconditional acceptance follows submission of a criminal-record certificate stamped by the Kuwaiti Embassy in your home university’s country. The two letters remind you of this crucial step. Acceptance letters are provided two months before the semester begins.' },
      { title: 'After conditional approval', tone: 'important', text: 'You can receive conditional approval before supplying the criminal-record certificate. After conditional approval, have the certificate stamped at the nearest Kuwaiti Embassy to achieve unconditional approval. Contact the embassy for information about health insurance in Kuwait and any other documents it may require.' },
      { title: 'KU handles visa issuance', text: 'Kuwait University arranges your visa completely. You do not need to visit the Kuwaiti Embassy for visa issuance. KU sends the visa to your home university’s Student Exchange Program office, your coordinator, and you.' },
      { title: 'Then, stamp the original visa', text: 'Once you receive the original visa issued by KU, have it stamped at the Kuwaiti Embassy in your home country. Visa issuance and embassy stamping are separate steps.' },
    ],
    contact: 'office',
  },
  {
    id: 'accommodation', icon: 'home', title: 'Accommodation & transport', subtitle: 'A place to stay. A way to get around.', accent: 'mint',
    blocks: [
      { title: 'Make yourself at home', text: 'KU provides free accommodation and free meals in the KU dormitory.' },
      { title: 'From the airport to KU', text: 'Free airport pickup and drop-off are provided. Contact the office to coordinate your travel arrangements.' },
      { title: 'Your campus connection', text: 'Free buses run between the College of Business Administration (CBA) and the KU dormitory, in both directions.' },
    ],
    contact: 'office',
  },
  {
    id: 'arrival', icon: 'plane', title: 'Your arrival', subtitle: 'Give yourself time to land and settle in.', accent: 'sky',
    blocks: [
      { title: 'Before you book that flight', tone: 'important', text: 'Get in touch with the exchange office or one of our coordinators before scheduling your flight.' },
      { title: 'Arrive one week before classes', text: 'Plan to arrive one week before the start of the semester to complete the residence procedure required by the Visa Department at KU. Use the semester dates above to plan ahead.' },
      { title: 'Arrange your airport transfer', text: 'KU provides free airport pickup and drop-off. Ask the office about your arrival arrangements when you discuss your flight.' },
    ],
    contact: 'office',
  },
  {
    id: 'courses', icon: 'book', title: 'Courses & study life', subtitle: 'Find your rhythm for the semester.', accent: 'lavender',
    blocks: [
      { title: 'Choose your course load', table: { caption: 'Incoming student course loads', headings: ['Level', 'Minimum', 'Regular load', 'Maximum'], rows: [['Undergraduate', '12 credits · about 4 courses', '15 credits · about 5 courses', '18 credits · about 6 courses'], ['Graduate', '6 credits', '—', '9 credits']] } },
      { title: 'Changing your course plans', text: 'You may withdraw from a course until the end of the sixth week of the semester, provided your remaining credits do not fall below the minimum load for your level.' },
      { title: 'Language & learning', text: 'Teaching is in English. Arabic is mainly used for communication among students at the college, who also speak good English. Incoming students are expected to follow KU rules and regulations.' },
      { title: 'Your transcript', text: 'You receive your transcript within one month after the semester ends. For questions, contact the team for your study level.', contacts: [
        { label: 'Undergraduate records', email: 'records@ku.edu.kw', phone: '+965 2498 6251', tel: 'tel:+96524986251' },
        { label: 'Graduate records', email: 'zahraa.ali2@ku.edu.kw', phone: '+965 2498 5663', tel: 'tel:+96524985663', whatsapp: '+965 2498 3366', chat: 'https://wa.me/96524983366' },
      ] },
    ],
  },
  {
    id: 'campus', icon: 'campus', title: 'Campus & community', subtitle: 'There is more to your exchange than classes.', accent: 'peach',
    blocks: [
      { title: 'Around the CBA campus', text: 'Your campus essentials include:', items: ['Medical center', 'Bank', 'Computer labs', 'Stationery & copy room', 'Supermarket', 'Library', 'Cafés'] },
      { title: 'Make time for what you love', text: 'Explore student activities and meet people beyond your classes.', items: ['Gym & sports center', 'Swimming pool', 'Arts club', 'Music club'] },
      { title: 'Find your people', text: 'Discover the student clubs at CBA.', items: ['Dean’s List Council', 'Finance Club', 'Accounting Club', 'The Talent’s Club', 'ISOM Club', 'Public Administration Club', 'Economics Club'] },
    ],
  },
  {
    id: 'living', icon: 'sun', title: 'Living in Kuwait', subtitle: 'A few essentials for your new everyday.', accent: 'mint',
    blocks: [
      { title: 'Settle into your routine', text: 'Dormitory accommodation, dormitory meals, and buses between CBA and the KU dormitory are provided free. The CBA campus also has a supermarket and cafés for everyday needs.' },
      { title: 'Sort out health insurance', text: 'After conditional approval, contact the Kuwaiti Embassy for information about health insurance in Kuwait and any additional documents you may need.' },
      { title: 'Stay connected', text: 'English is the language of teaching. You will also hear Arabic in conversations around the college, where students speak good English. Join a club or student activity to get to know your new community.' },
      { title: 'When you need a hand', text: 'Keep the exchange office’s contact details handy. Ask about your accommodation, transport, or arrival preparations whenever you need clarification.' },
    ],
    contact: 'office',
  },
]
