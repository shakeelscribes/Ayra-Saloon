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

export const testimonials = [
  {
    name: 'Arun Kumar',
    role: 'Regular since 2019 · Palayamkottai',
    avatar: '/images/avatar_1.jpg',
    text: 'Best barber work in Tirunelveli, hands down. Sharp beard, clean finish, in and out in thirty minutes.',
  },
  {
    name: 'Guru Prasad',
    role: 'Loyal Client · Samathanapuram',
    avatar: '/images/avatar_2.jpg',
    text: 'Clean place, modern equipment, and the stylists actually listen. I bring my whole family here.',
  },
  {
    name: 'Priya Raghavan',
    role: 'Bridal Client · Tirunelveli',
    avatar: '/images/avatar_3.jpg',
    text: 'They did my bridal makeup exactly how I had pictured it — professional, punctual and far more affordable than other quotes I got.',
  },
]
