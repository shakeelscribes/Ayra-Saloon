// Local mock data so the landing page renders without the backend.
// Swap these for API calls when the backend is live.

export const stats = [
  { value: 2000, suffix: '+', label: 'Happy Clients' },
  { value: 12, suffix: '+', label: 'Years of Mastery' },
  { value: 20, suffix: '+', label: 'Services Offered' },
]

export const services = [
  {
    id: '01',
    name: 'Hair Studio',
    image: '/images/service_hair.jpg',
    price: 'From ₹499',
    description:
      'Precision cuts, colour and styling for men and women — skilled hands, honest prices, zero pretence.',
    details: ['Cuts & Styling', 'Colour & Highlights', 'Keratin & Smoothening'],
  },
  {
    id: '02',
    name: 'Beard & Shave',
    image: '/images/service_grooming.jpg',
    price: 'From ₹299',
    description:
      'Hot-towel shaves, beard sculpting and skin care — sharp, clean work at prices that keep you coming back.',
    details: ['Beard Sculpting', 'Hot-Towel Shave', 'Facials & Detan'],
  },
  {
    id: '03',
    name: 'Bridal & Beauty',
    image: '/images/service_bridal.jpg',
    price: 'On consultation',
    description:
      'Bridal makeup, party styling and complete women\'s hair care from a team that has done this a thousand times.',
    details: ['Bridal Makeup', 'Party & Reception Styling', 'Mehendi & Sangeet'],
  },
  {
    id: '04',
    name: 'Ink Studio',
    image: '/images/service_tattoo.jpg',
    price: 'From ₹1,999',
    description:
      'Custom artwork by resident artists in a studio that meets clinical standards of hygiene.',
    details: ['Custom Design', 'Cover-ups', 'Piercing'],
  },
]

/* ── Marquee ticker ──────────────────────────────────────────────────────── */
export const marqueeWords = [
  'Precision Fades',
  'Beard Sculpting',
  'Hot-Towel Shaves',
  'Hair Colour',
  'Keratin & Smoothening',
  'Bridal Glam',
  'Fine-Line Tattoos',
  'Kids’ Cuts',
]

/* ── Before / After gallery slots ────────────────────────────────────────── */
/* PLACEHOLDER PAIRS — swap both files once transformation photos are ready.  */
/* AI prompt pack for generating replacements is delivered separately.        */
export const transformations = [
  {
    title: 'Precision Fade',
    caption: 'Skin fade, textured top — 40 minutes in the chair.',
    before: '/images/ba_fade_before.jpg',
    after: '/images/ba_fade_after.jpg',
  },
  {
    title: 'Sharp Beard Sculpt',
    caption: 'From week-old growth to a razor-lined finish.',
    before: '/images/ba_beard_before.jpg',
    after: '/images/ba_beard_after.jpg',
  },
  {
    title: 'Bridal Glow',
    caption: 'Consultation, trial, then the big day — flawless.',
    before: '/images/ba_bridal_before.jpg',
    after: '/images/ba_bridal_after.jpg',
  },
  {
    title: 'Fresh Ink',
    caption: 'Custom fine-line work by our resident artist.',
    before: '/images/ba_ink_before.jpg',
    after: '/images/ba_ink_after.jpg',
  },
]

/* ── Testimonials — expanded to six ─────────────────────────────────────── */
export const testimonials = [
  {
    name: 'Arun Kumar',
    role: 'Regular since 2019 · Palayamkottai',
    avatar: '/images/avatar_1.jpg',
    text: 'Best barber work in Tirunelveli, hands down. I have been getting my fade from Raja for years — sharp lines, clean finish, in and out in thirty minutes.',
  },
  {
    name: 'Guru Prasad',
    role: 'Loyal Client · Samathanapuram',
    avatar: '/images/avatar_2.jpg',
    text: 'Clean place, modern equipment, and the stylists actually listen to what you want instead of doing whatever they like. I bring my whole family here.',
  },
  {
    name: 'Priya Raghavan',
    role: 'Bridal Client · Tirunelveli',
    avatar: '/images/avatar_3.jpg',
    text: 'They did my bridal makeup exactly how I had pictured it — the trial session made all the difference. Professional, punctual and far more affordable than other quotes I got.',
  },
  {
    name: 'Karthik Raja',
    role: 'First Tattoo · Tirunelveli Junction',
    avatar: '/images/avatar_4.jpg',
    text: 'Ajay walked me through the whole design before touching needle to skin. Studio was spotless, sealed needles opened in front of me. Could not have asked for a better first tattoo.',
  },
  {
    name: 'Mohammed Sait',
    role: 'Keratin Treatment · Melapalayam',
    avatar: '/images/avatar_5.jpg',
    text: 'They told me honestly that my hair did not need the costliest treatment — just the right one. Three months later it is still smooth. That kind of advice earns trust.',
  },
  {
    name: 'Divya Shankar',
    role: 'Colour & Highlights · Palayamkottai',
    avatar: '/images/avatar_6.jpg',
    text: 'They studied my skin tone before suggesting the shade, not after. The highlights suit me better than what I originally asked for. Genuinely skilled people here.',
  },
]

/* ── FAQ — drafted for brand voice; correct specifics as needed ──────────── */
export const faqs = [
  {
    q: 'Do I need an appointment, or can I walk in?',
    a: 'Walk-ins are welcome whenever a chair is free — but we strongly recommend booking ahead online. It takes under a minute, guarantees your slot, and lets us pair you with the right stylist.',
  },
  {
    q: 'How long will my service take?',
    a: 'A haircut usually takes 30–45 minutes. Hair colour runs about 1.5–2 hours, and keratin or smoothening treatments take 2–3 hours. We always tell you the expected time before starting, so you can plan your day.',
  },
  {
    q: 'What products do you use?',
    a: 'Only professional, salon-grade products — including ammonia-free colour options for sensitive scalps. We recommend what suits your hair type, not what costs the most.',
  },
  {
    q: 'How does bridal makeup work?',
    a: 'It starts with a consultation and a trial session, so your look is locked in well before the wedding day. Our partner bridal artists handle everything from engagement to reception looks, with packages built around your events.',
  },
  {
    q: 'What if I need to cancel or reschedule?',
    a: 'Life happens. Give us 24 hours notice if you can — a quick call or WhatsApp message is enough — and we will happily move your slot or offer it to another client. No cancellation fees.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'Cash, UPI and cards are all accepted. Whichever is easiest for you.',
  },
  {
    q: 'Is Ayra only for men?',
    a: 'You might know us best for men’s grooming — fades, beards, tattoos — but every service we offer is open to everyone: women’s styling, colour, treatments, bridal work and kids’ cuts too.',
  },
]
