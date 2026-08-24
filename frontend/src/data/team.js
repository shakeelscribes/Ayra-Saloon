/**
 * Static team roster — two chairs, zero attitude.
 * Photos: drop files into /public/images and set photo paths here;
 * oversized monogram badges render until then.
 */
export const stylists = [
  {
    slug: 'raja',
    name: 'Raja',
    role: 'Hair Stylist',
    experienceYears: 8,
    tagline: 'Precision fades, classic cuts, honest advice.',
    photo: null,
    bio: [
      'Raja is the reason half of Palayamkottai has the same haircut — because it is the right one for them. Eight years behind the chair taught him that a great cut is less about what is trendy and more about what survives tomorrow morning with zero effort.',
      'He reads your hairline before your hair, tells you honestly when an idea will not suit you, and treats every fade like it is going on a magazine cover. Fair warning: chair-side conversations range from cricket analysis to life advice, free of charge.',
    ],
    specialties: ['Precision Fades', 'Classic Scissor Cuts', 'Textured Crops', 'Colour Consults'],
    servicesHandled: ['hair', 'grooming'],
    stats: [
      { value: 8, suffix: '+', label: 'Years of craft' },
      { value: 4000, suffix: '+', label: 'Cuts delivered' },
      { value: 98, suffix: '%', label: 'Would return' },
    ],
    funFacts: [
      { icon: 'music', label: 'On the aux', value: 'Tamil classics & 90s Kollywood' },
      { icon: 'scissors', label: 'Signature move', value: 'The 20-minute precision fade' },
      { icon: 'chat', label: 'Chair style', value: 'Straight talk, zero sales pitch' },
    ],
  },
  {
    slug: 'ajay',
    name: 'Ajay',
    role: 'Hair Stylist & Tattoo Artist',
    experienceYears: 6,
    tagline: 'Clean cuts by day, custom ink by appointment.',
    photo: null,
    bio: [
      'Ajay is our double threat — sharp enough with clippers to keep the regulars loyal and steady enough with a needle that people drive in from neighbouring districts for his line work. Six years of doing both means he understands skin and hair at a level most artists never reach.',
      'His tattoo process starts long before the machine turns on: listen first, sketch second. Every piece is drawn for the person wearing it, not copied off a wall. Hygiene is non-negotiable — sealed needles opened in front of you, every session.',
    ],
    specialties: ['Beard Sculpting', 'Fine-Line Tattoos', 'Custom Designs', 'Hot-Towel Shaves'],
    servicesHandled: ['hair', 'grooming', 'tattoo'],
    stats: [
      { value: 6, suffix: '+', label: 'Years of craft' },
      { value: 2500, suffix: '+', label: 'Cuts & shaves' },
      { value: 300, suffix: '+', label: 'Ink sessions' },
    ],
    funFacts: [
      { icon: 'pen', label: 'Always in pocket', value: 'A sketchbook, always' },
      { icon: 'chat', label: 'Ink philosophy', value: 'Listen first, sketch second' },
      { icon: 'sparkles', label: 'Double threat', value: 'Cut + tattoo, same visit' },
    ],
  },
]

export function getStylistBySlug(slug) {
  return stylists.find((s) => s.slug === slug)
}
