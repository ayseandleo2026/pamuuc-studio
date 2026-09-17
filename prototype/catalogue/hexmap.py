# Approximate swatch hex derived from the Stanley/Stella colour NAME.
# The name is authoritative; the tint is an approximation for the mockup only.
# Replace with Stanley/Stella's published values before any customer sees them.
BASE=[
 ('off white','#F2EFE8'),('vintage white','#EFEAE0'),('re-white','#F7F5F0'),('white','#F7F4EE'),
 ('natural raw','#E8DFCC'),('natural','#E6DCC6'),('cream heather grey','#DED9CF'),
 ('cream heather pink','#E4D3CC'),('cream','#EFE6D4'),('butter','#F0E2A8'),
 ('honey paper','#E9DCC0'),('desert dust','#DCCBB0'),('grounded beige','#D6C6AC'),
 ('beige oxford','#D3C6AE'),('latte','#C9AE8E'),('g. dyed latte','#C9AE8E'),
 ('mocha','#8A6A52'),('g.dyed mocha','#8A6A52'),('kaffa coffee','#4A3527'),
 ('heritage brown','#6B4A35'),('red brown','#7A3B2C'),('bronze','#8C6239'),('g.dyed bronze','#8C6239'),
 ('ochre','#C08A2E'),('g. dyed gold ochre','#C08A2E'),('stone','#B5AA9A'),('heather sand','#CFC3AE'),
 ('re-black','#151515'),('g. dyed black rock','#1E1C1B'),('g. dyed black','#141414'),('black','#0E0E0E'),
 ('anthracite','#33383B'),('g. dyed anthracite','#33383B'),('deep metal','#3E4548'),
 ('india ink grey','#3B3F45'),('lava grey','#55585C'),('dark heather grey','#4C4F52'),
 ('mid heather grey','#8A8D90'),('cool heather grey','#A9AFB3'),('misty grey','#B9BCBE'),
 ('g. dyed misty grey','#B9BCBE'),('heather grey','#A3A6A8'),('eco-heather','#B0ADA4'),
 ('heather haze','#B7B2AC'),('heather rainbow','#AFAAA6'),('blue grey','#7C8A96'),
 ('g. dyed blue grey','#7C8A96'),('g. dyed blue stone','#6E8296'),('pebble blue','#8FA3B3'),
 ('re-navy','#1E2A44'),('g.dyed navy','#1E2A44'),('french navy','#22304C'),('midnight blue','#1B2740'),
 ('ocean depth','#1F3A4D'),('deep teal','#1E4B4F'),('worker blue','#3E5A7A'),('dark heather blue','#46566B'),
 ('mindful blue','#4C6B86'),('serene blue','#6E93B0'),('summer blue','#7FA8C9'),('sky blue','#8FC0DE'),
 ('blue ice','#C3D9E6'),('aqua blue','#6FC2CF'),('g. dyed hydro','#5E9BAE'),('g. dyed swimmer blue','#5E86AE'),
 ('caribbean blue','#3FA9C9'),('pool blue','#5BB7D4'),('bright blue','#1F6FD0'),('royal blue','#2D4FA8'),
 ('blue oxford','#41536B'),('blue soul','#5A6E88'),('stargazer','#3C4C6E'),('dusk','#6B6E8A'),
 ('bottle green','#1F4B34'),('glazed green','#2F5E45'),('verdant green','#31694A'),('green bay','#4E7A5C'),
 ('g. dyed green bay','#4E7A5C'),('go green','#3FA35A'),('stem green','#7FA85C'),('lime flash','#B9D437'),
 ('misty jade','#8FB5A6'),('sage','#A8B79B'),('aloe','#9FB79A'),('mosstone','#7A8B६B'.replace('६','6')),
 ('faded olive','#6E6B4A'),('olive oil','#7C7A50'),('soft khaki','#9A9madeup'.replace('madeup','A78')),
 ('british khaki','#8A8360'),('g. dyed khaki','#7E7A58'),('khaki','#7E7A58'),('camouflage','#6B6A4E'),
 ('teal monstera','#24685F'),('day fall','#8C7E6A'),
 ('passionate red','#B5202C'),('earthy red','#8E3A33'),('red earth','#9C4A38'),('red','#C0242E'),
 ('burgundy','#6B2333'),('fiesta','#C2452E'),('flame orange','#E2622B'),('bright orange','#EE7623'),
 ('nispero','#E08A4C'),('fraiche peche','#F0A986'),('canyon pink','#C98E86'),('cotton pink','#E7C3C0'),
 ('bubble pink','#EFB2C4'),('g. dyed bubble pink','#EFB2C4'),('g.dyed blush','#E6C3BE'),
 ('pink joy','#E8899F'),('hibiscus rose','#C94F72'),('orchid flower','#B268A6'),
 ('purple love','#6B4C86'),('g. dyed purple love','#6B4C86'),('deep plum','#4E2B42'),
 ('violet','#5E4B8B'),('lavender','#B3A6D1'),('lilac dream','#C7B9DE'),
 ('spectra yellow','#F2C230'),('viva yellow','#F5CE3E'),('lemon sorbet','#F3E28A'),
 ('light wash','#A8BCD0'),('mid wash','#6E88A6'),('rinse wash','#3E5670'),
]
def hexof(name):
    n=(name or '').strip().lower()
    for key,hx in BASE:
        if n==key: return hx
    for key,hx in BASE:
        if key in n: return hx
    return '#9A9A96'
