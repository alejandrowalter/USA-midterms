/* Quién ocupa el cargo hoy, antes de la elección del 3 nov 2026.
   Senado: lista de los 100 senadores al 26 oct 2026
   (https://www.congresscountdown.com/info/us-senators; 53 R, 45 D, 2 I).
   El escaño de 2026 es el de clase 2, más las especiales de Florida (Moody) y Ohio (Husted),
   que coinciden con las 35 carreras del feed del NYT.
   Gobernadores y Cámara: The Green Papers, composición partidaria del 119.º Congreso
   (https://www.thegreenpapers.com/G26/composition.phtml): 24 D / 26 R gobernadores;
   Cámara 214 D, 1 I, 218 R, 2 vacantes (FL y TX). */
const HOLD = {
  asOf: "2026-10-26",
  senate: {
    AL:["R","R"], AK:["R","R"], AZ:["D","D"], AR:["R","R"], CA:["D","D"], CO:["D","D"],
    CT:["D","D"], DE:["D","D"], FL:["R","R"], GA:["D","D"], HI:["D","D"], ID:["R","R"],
    IL:["D","D"], IN:["R","R"], IA:["R","R"], KS:["R","R"], KY:["R","R"], LA:["R","R"],
    ME:["R","I"], MD:["D","D"], MA:["D","D"], MI:["D","D"], MN:["D","D"], MS:["R","R"],
    MO:["R","R"], MT:["R","R"], NE:["R","R"], NV:["D","D"], NH:["D","D"], NJ:["D","D"],
    NM:["D","D"], NY:["D","D"], NC:["R","R"], ND:["R","R"], OH:["R","R"], OK:["R","R"],
    OR:["D","D"], PA:["D","R"], RI:["D","D"], SC:["R","R"], SD:["R","R"], TN:["R","R"],
    TX:["R","R"], UT:["R","R"], VT:["I","D"], VA:["D","D"], WA:["D","D"], WV:["R","R"],
    WI:["D","R"], WY:["R","R"]
  },
  senateUp: {
    AL:"R", AK:"R", AR:"R", CO:"D", DE:"D", FL:"R", GA:"D", ID:"R", IL:"D", IA:"R",
    KS:"R", KY:"R", LA:"R", ME:"R", MA:"D", MI:"D", MN:"D", MS:"R", MT:"R", NE:"R",
    NH:"D", NJ:"D", NM:"D", NC:"R", OH:"R", OK:"R", OR:"D", RI:"D", SC:"R", SD:"R",
    TN:"R", TX:"R", VA:"D", WV:"R", WY:"R"
  },
  gov: {
    AL:"R", AK:"R", AZ:"D", AR:"R", CA:"D", CO:"D", CT:"D", DE:"D", FL:"R", GA:"R",
    HI:"D", ID:"R", IL:"D", IN:"R", IA:"R", KS:"D", KY:"D", LA:"R", ME:"D", MD:"D",
    MA:"D", MI:"D", MN:"D", MS:"R", MO:"R", MT:"R", NE:"R", NV:"R", NH:"R", NJ:"D",
    NM:"D", NY:"D", NC:"D", ND:"R", OH:"R", OK:"R", OR:"D", PA:"D", RI:"D", SC:"R",
    SD:"R", TN:"R", TX:"R", UT:"R", VT:"R", VA:"D", WA:"D", WV:"R", WI:"D", WY:"R"
  },
  house: {
    AL:{d:2,r:5,i:0,v:0}, AK:{d:0,r:1,i:0,v:0}, AZ:{d:3,r:6,i:0,v:0}, AR:{d:0,r:4,i:0,v:0},
    CA:{d:43,r:8,i:1,v:0}, CO:{d:4,r:4,i:0,v:0}, CT:{d:5,r:0,i:0,v:0}, DE:{d:1,r:0,i:0,v:0},
    FL:{d:7,r:20,i:0,v:1}, GA:{d:5,r:9,i:0,v:0}, HI:{d:2,r:0,i:0,v:0}, ID:{d:0,r:2,i:0,v:0},
    IL:{d:14,r:3,i:0,v:0}, IN:{d:2,r:7,i:0,v:0}, IA:{d:0,r:4,i:0,v:0}, KS:{d:1,r:3,i:0,v:0},
    KY:{d:1,r:5,i:0,v:0}, LA:{d:2,r:4,i:0,v:0}, ME:{d:2,r:0,i:0,v:0}, MD:{d:7,r:1,i:0,v:0},
    MA:{d:9,r:0,i:0,v:0}, MI:{d:6,r:7,i:0,v:0}, MN:{d:4,r:4,i:0,v:0}, MS:{d:1,r:3,i:0,v:0},
    MO:{d:2,r:6,i:0,v:0}, MT:{d:0,r:2,i:0,v:0}, NE:{d:0,r:3,i:0,v:0}, NV:{d:3,r:1,i:0,v:0},
    NH:{d:2,r:0,i:0,v:0}, NJ:{d:9,r:3,i:0,v:0}, NM:{d:3,r:0,i:0,v:0}, NY:{d:19,r:7,i:0,v:0},
    NC:{d:4,r:10,i:0,v:0}, ND:{d:0,r:1,i:0,v:0}, OH:{d:5,r:10,i:0,v:0}, OK:{d:0,r:5,i:0,v:0},
    OR:{d:5,r:1,i:0,v:0}, PA:{d:7,r:10,i:0,v:0}, RI:{d:2,r:0,i:0,v:0}, SC:{d:1,r:6,i:0,v:0},
    SD:{d:0,r:1,i:0,v:0}, TN:{d:1,r:8,i:0,v:0}, TX:{d:13,r:24,i:0,v:1}, UT:{d:0,r:4,i:0,v:0},
    VT:{d:1,r:0,i:0,v:0}, VA:{d:6,r:5,i:0,v:0}, WA:{d:8,r:2,i:0,v:0}, WV:{d:0,r:2,i:0,v:0},
    WI:{d:2,r:6,i:0,v:0}, WY:{d:0,r:1,i:0,v:0}
  }
};
