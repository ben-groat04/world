// Origin-conditioned names for Larkfield. DATA + a tiny pure picker (takes a sim RNG; no Math.random).
// Groups follow calibration.ethnicity.detail plus Mixed and Other. Names are common real names for that background in UK inner cities; ethnicity never
// implies occupation, religion, or behaviour here (the sim keeps religion as its own draw, with the conditional tables in RELIGION_BY_GROUP).
// first names: {M:[[name, weight]...] per cohort: 'old' (born <1965), 'mid' (1965-1990), 'young' (1991+)}.  Weights are relative.
const w = (s) => s.split(/\s+/).filter(Boolean).map((x) => { const [n, k] = x.split(':'); return [n.replace(/_/g, ' '), k ? +k : 1]; });
export const GROUPS = {
  white_british: {
    label: 'White British', birth: { uk: 0.985, other: [['Ireland', 2], ['Australia', 1], ['USA', 1], ['Germany', 1]] },
    first: {
      M: { old: w('David:8 John:8 Michael:7 Peter:6 Paul:6 Stephen:5 Robert:5 Brian:4 Kevin:4 Alan:5 Graham:3 Keith:3 Ian:5 Mark:5 Philip:3 Colin:3 Trevor:2 Barry:2 Terry:2 Derek:2 Neil:3 Gary:4 Andrew:5 Martin:3'),
           mid: w('Daniel:6 James:7 Matthew:6 Christopher:6 Lee:4 Craig:4 Jason:4 Darren:3 Carl:3 Adam:5 Ryan:4 Scott:3 Ben:4 Sam:3 Chris:5 Jamie:4 Richard:5 Simon:4 Tom:4 Nick:3 Dean:3 Liam:3'),
           young: w('Jack:7 Oliver:7 Harry:6 Charlie:6 George:6 Thomas:5 Jacob:4 Alfie:4 Joshua:4 Leo:4 Archie:3 Noah:4 Ethan:3 Mason:3 Callum:3 Kyle:3 Connor:3 Dylan:3 Ryan:3 Max:3 Finley:2 Reece:2 Tyler:2 Luke:3') },
      F: { old: w('Susan:6 Margaret:5 Christine:5 Linda:6 Patricia:4 Carol:5 Janet:4 Sandra:5 Jean:3 Barbara:4 Valerie:2 Pauline:3 Julie:5 Karen:6 Elizabeth:4 Mary:4 Anne:5 Jacqueline:3 Gillian:3 Wendy:3 Sheila:2 Maureen:2 Lorraine:2 Denise:3'),
           mid: w('Sarah:7 Emma:6 Claire:5 Joanne:4 Rachel:5 Nicola:4 Lisa:5 Michelle:5 Amanda:4 Kelly:4 Gemma:4 Laura:5 Rebecca:5 Louise:5 Helen:5 Katie:4 Samantha:4 Hayley:3 Donna:3 Natalie:4 Zoe:3 Kerry:2 Stacey:3 Jenny:3'),
           young: w('Olivia:7 Amelia:6 Emily:6 Sophie:5 Ella:4 Grace:4 Lily:4 Mia:4 Chloe:4 Jessica:4 Millie:3 Evie:3 Poppy:3 Isla:3 Freya:3 Holly:3 Ruby:3 Abigail:2 Lucy:3 Megan:3 Daisy:2 Lola:2 Hannah:3 Georgia:3') },
    },
    last: w('Smith:10 Jones:8 Taylor:7 Brown:7 Williams:6 Wilson:5 Davies:5 Evans:4 Thomas:4 Johnson:5 Roberts:4 Walker:4 Wright:4 Robinson:4 Thompson:4 White:4 Hughes:3 Edwards:3 Green:3 Hall:3 Wood:3 Harris:3 Lewis:3 Martin:3 Jackson:3 Clarke:3 Clark:2 Turner:3 Hill:3 Scott:3 Cooper:3 Morris:3 Ward:3 Moore:3 King:3 Watson:3 Baker:3 Harrison:3 Morgan:3 Patel_:0 Kelly:2 Mitchell:2 Booth:2 Ashworth:1 Holt:1 Pickles:0.4 Entwistle:0.5 Greenwood:1 Hartley:1 Whittle:0.5 Brennan:1 Doyle:1 Murphy:2 Fletcher:2 Barlow:1 Lomax:0.5 Cartwright:1 Platt:0.7'),
  },
  other_white: {
    label: 'Other White (EU/Eastern European/Irish/Southern European/other)', birth: { uk: 0.14, other: [['Poland', 22], ['Romania', 14], ['Italy', 8], ['Ireland', 8], ['Lithuania', 6], ['Portugal', 7], ['Spain', 6], ['Bulgaria', 4], ['Germany', 3], ['France', 4], ['Latvia', 2], ['Slovakia', 3], ['Czechia', 2], ['Greece', 2], ['Hungary', 2], ['Ukraine', 3], ['Albania', 2], ['Russia', 2], ['USA', 3], ['Brazil', 0.5]] },
    // sub-origins keep names internally coherent: a draw picks one sub-origin then names from it
    sub: {
      polish: { w: 22, first: { M: w('Piotr:5 Krzysztof:4 Tomasz:5 Marcin:5 Michał:5 Paweł:5 Jakub:5 Kamil:4 Adam:3 Łukasz:5 Mateusz:5 Szymon:3 Filip:3 Jan:3'), F: w('Anna:6 Katarzyna:5 Agnieszka:5 Magdalena:5 Joanna:4 Marta:4 Ewa:4 Aleksandra:4 Natalia:4 Karolina:4 Zuzanna:3 Julia:3 Monika:4 Weronika:3') }, last: w('Nowak:6 Kowalski:6 Wiśniewski:5 Wójcik:5 Kowalczyk:5 Kamiński:4 Lewandowski:4 Zieliński:4 Szymański:3 Woźniak:3 Dąbrowski:3 Kozłowski:3 Mazur:3 Krawczyk:3 Piotrowski:2 Grabowski:2'), fem: { Kowalski: 'Kowalska', Nowak: 'Nowak', Wiśniewski: 'Wiśniewska', Wójcik: 'Wójcik', Kowalczyk: 'Kowalczyk', Kamiński: 'Kamińska', Lewandowski: 'Lewandowska', Zieliński: 'Zielińska', Szymański: 'Szymańska', Woźniak: 'Woźniak', Dąbrowski: 'Dąbrowska', Kozłowski: 'Kozłowska', Mazur: 'Mazur', Krawczyk: 'Krawczyk', Piotrowski: 'Piotrowska', Grabowski: 'Grabowska' } },
      romanian: { w: 14, first: { M: w('Andrei:5 Alexandru:5 Mihai:4 Ionuț:4 Cristian:4 Florin:3 Gabriel:4 Marius:4 Daniel:3 Bogdan:3 Vlad:2'), F: w('Maria:5 Elena:5 Ioana:4 Andreea:5 Alexandra:4 Cristina:4 Mihaela:4 Diana:3 Laura:3 Georgiana:3 Raluca:3') }, last: w('Popescu:6 Ionescu:6 Popa:5 Dumitru:4 Stan:4 Constantin:3 Gheorghe:3 Marin:3 Radu:3 Stoica:3 Munteanu:3 Dinu:2') },
      italian: { w: 8, first: { M: w('Marco:5 Luca:5 Giuseppe:4 Francesco:4 Andrea:5 Matteo:4 Alessandro:4 Davide:3 Simone:3 Paolo:3'), F: w('Giulia:5 Francesca:5 Chiara:4 Sara:4 Martina:3 Elena:4 Valentina:4 Alessia:3 Federica:3 Silvia:3') }, last: w('Rossi:5 Russo:4 Ferrari:4 Esposito:3 Bianchi:4 Romano:4 Colombo:3 Ricci:3 Marino:3 Greco:3 Conti:3 De_Luca:2') },
      irish: { w: 8, first: { M: w('Sean:4 Patrick:5 Kevin:3 Declan:3 Conor:4 Brendan:3 Eoin:3 Cian:3 Michael:4 Liam:4'), F: w('Siobhan:4 Aoife:4 Niamh:4 Orla:3 Sinead:4 Ciara:4 Mary:3 Catherine:3 Roisin:3 Grainne:2') }, last: w('Murphy:6 Kelly:5 Byrne:5 Ryan:4 OBrien:4 Walsh:4 Doyle:4 McCarthy:3 Gallagher:3 OConnor:4 Kavanagh:2 Quinn:3') },
      iberian: { w: 13, first: { M: w('João:5 Pedro:4 Tiago:4 Miguel:4 Carlos:5 Javier:4 David:3 Diego:3 Rui:3 Bruno:3 Jorge:3 Luis:3 Pablo:3'), F: w('Ana:6 Maria:5 Marta:4 Sofia:4 Inês:4 Catarina:4 Carmen:4 Lucía:4 Beatriz:3 Raquel:3 Laura:3 Paula:3') }, last: w('Silva:6 Santos:5 Ferreira:4 Pereira:4 Costa:4 Oliveira:4 García:5 Martínez:4 López:4 Fernández:4 Rodríguez:4 González:3 Sánchez:3') },
      baltic: { w: 6, first: { M: w('Tomas:4 Andrius:4 Mantas:3 Dainius:3 Rokas:4 Artūrs:3 Jānis:3 Mindaugas:3 Kristaps:2'), F: w('Ieva:4 Rasa:3 Gintarė:3 Laura:3 Agnė:3 Līga:3 Inese:2 Rūta:3 Jolanta:3') }, last: w('Kazlauskas:4 Petrauskas:4 Jankauskas:3 Bērziņš:3 Kalniņš:3 Ozols:2 Stankevičius:3 Navickas:2') },
      balkan_slavic: { w: 9, first: { M: w('Ivan:4 Georgi:3 Nikolay:3 Dimitar:3 Martin:3 Jozef:3 Peter:3 Dmytro:3 Oleksandr:4 Arben:2 Erion:2'), F: w('Maria:3 Iva:3 Desislava:3 Elitsa:2 Katarína:3 Lucia:3 Olena:4 Oksana:3 Natalia:3 Mirela:2') }, last: w('Ivanov:5 Georgiev:4 Dimitrov:4 Petrov:4 Hoxha:3 Shehu:2 Novák:3 Horváth:3 Kovalenko:4 Shevchenko:3 Melnyk:3') },
      western_eu: { w: 20, first: { M: w('Thomas:3 Lars:2 Jonas:3 Pierre:3 Antoine:3 Nicolas:3 Mark:3 Sebastian:3 Felix:2 Matthias:2 Jan:2 Stefan:2 Michael:2 Daniel:2'), F: w('Marie:3 Claire:3 Sophie:3 Anna:3 Julia:3 Lena:3 Laura:3 Eva:2 Katja:2 Emma:2 Charlotte:2 Elise:2') }, last: w('Müller:4 Schmidt:3 Schneider:3 Fischer:3 Weber:3 Martin:4 Bernard:3 Dubois:3 Moreau:3 Laurent:3 De_Vries:3 Jansen:3 Peeters:3 Larsen:2 Johansson:2 Andersson:2') },
    },
  },
  indian: {
    label: 'Indian', birth: { uk: 0.5, other: [['India', 78], ['Kenya', 6], ['Uganda', 3], ['Tanzania', 2], ['Sri Lanka', 3], ['Singapore', 1], ['Mauritius', 1], ['UAE', 2], ['USA', 1]] },
    sub: {
      punjabi_sikh: { w: 3, first: { M: w('Harpreet:3 Gurpreet:3 Jasvinder:3 Manjit:3 Balvinder:2 Amrik:2 Jagdeep:3 Sukhdev:2 Kuldeep:3 Rajinder:2 Arjun:3 Jaspal:2 Tarlochan:1'), F: w('Harpreet:3 Gurpreet:3 Jasleen:3 Manpreet:3 Simran:4 Kiran:3 Rupinder:2 Navjot:2 Amandeep:3 Baljit:2 Pavandeep:1') }, last: w('Singh:10 Kaur:0 Dhillon:3 Sandhu:3 Gill:4 Sidhu:3 Johal:2 Bains:2 Grewal:2 Sahota:2 Bhogal:2 Chahal:2 Mann:2 Sagoo:1'), fem: 'kaur' },
      gujarati: { w: 5, first: { M: w('Hitesh:3 Jignesh:3 Ketan:3 Nilesh:3 Dipak:3 Bhavin:3 Chirag:3 Mehul:3 Rakesh:3 Jay:4 Dhruv:3 Ravi:3'), F: w('Hetal:3 Priya:4 Nisha:4 Kinjal:3 Dipti:3 Bhavna:3 Krupa:3 Ami:3 Pooja:4 Mita:2 Anisha:3 Reena:3') }, last: w('Patel:14 Shah:5 Mehta:3 Desai:3 Joshi:3 Parmar:3 Amin:2 Thakkar:2 Modi:2 Pandya:2 Chauhan:2 Trivedi:2') },
      other_indian: { w: 6, first: { M: w('Rahul:4 Amit:4 Sanjay:3 Vikram:3 Anil:3 Suresh:3 Rohan:3 Karan:3 Arun:3 Vijay:3 Sunil:3 Deepak:3 Prakash:2 Aditya:3 Krishna:2 Nikhil:3'), F: w('Anjali:4 Sunita:3 Deepa:3 Meera:3 Divya:4 Neha:4 Shreya:3 Aisha:2 Lakshmi:3 Ritu:3 Sneha:3 Pallavi:3 Swati:3 Ananya:3 Kavita:3') }, last: w('Kumar:5 Sharma:5 Gupta:4 Reddy:4 Nair:3 Iyer:3 Menon:2 Bose:2 Banerjee:3 Chatterjee:2 Verma:3 Agarwal:3 Rao:3 Kapoor:3 Malhotra:2 Chopra:2 Bhatt:3') },
    },
  },
  pakistani: {
    label: 'Pakistani', birth: { uk: 0.62, other: [['Pakistan', 92], ['UAE', 3], ['Saudi Arabia', 2], ['Kenya', 1], ['Afghanistan', 1], ['UK-born abroad', 1]] },
    first: {
      M: { old: w('Mohammed:10 Muhammad:6 Mohammad:5 Abdul:4 Tariq:4 Mahmood:3 Shabir:3 Rashid:3 Arshad:3 Javed:3 Nasir:3 Iqbal:3 Khalid:3 Zahid:3 Aslam:3 Afzal:2 Naveed:2'),
           mid: w('Imran:6 Asif:4 Usman:4 Kashif:3 Adnan:4 Faisal:4 Bilal:5 Waqas:3 Zubair:3 Amir:4 Yasir:3 Hamza:4 Saqib:3 Adeel:2 Rizwan:4 Shahid:3 Naseem:2 Junaid:3 Haroon:3 Umar:4'),
           young: w('Ali:6 Omar:5 Zain:4 Hassan:4 Ibrahim:5 Yusuf:5 Ayaan:3 Hamza:4 Ahmed:4 Taha:3 Zayn:3 Rayyan:3 Saad:3 Daniyal:2 Zakariya:3 Musa:3 Idris:3 Adam:4') },
      F: { old: w('Shazia:3 Nasreen:4 Rukhsana:3 Naheed:3 Parveen:3 Saima:3 Kauser:3 Shaheen:3 Razia:3 Farida:3 Yasmin:4 Sabiha:2 Zubaida:2 Rubina:3 Tahira:3'),
           mid: w('Sana:4 Ayesha:5 Fatima:4 Hina:4 Saira:4 Sobia:3 Nadia:5 Samina:3 Aisha:4 Maryam:4 Iram:3 Bushra:3 Amna:3 Sidra:3 Mehreen:3 Rabia:3 Zainab:4 Mariam:3 Sumaira:3'),
           young: w('Aisha:5 Maryam:5 Fatima:5 Zainab:5 Amina:5 Aaliyah:3 Hana:3 Inaya:3 Khadija:4 Layla:3 Safiya:3 Zara:4 Sofia:3 Eman:3 Mahnoor:3 Noor:3 Alisha:3 Hafsa:3') },
    },
    last: w('Khan:12 Ahmed:8 Hussain:8 Ali:7 Shah:5 Iqbal:5 Akhtar:4 Malik:5 Butt:4 Mahmood:4 Hussein:2 Chaudhry:4 Rehman:3 Qureshi:3 Sheikh:3 Raza:3 Aslam:3 Mirza:3 Anwar:3 Javed:2 Bashir:2 Siddiqui:3 Rana:3 Awan:2 Mughal:2'),
  },
  bangladeshi: {
    label: 'Bangladeshi', birth: { uk: 0.55, other: [['Bangladesh', 94], ['Saudi Arabia', 2], ['UAE', 2], ['Italy', 1], ['Malaysia', 1]] },
    first: {
      M: { old: w('Abdul:5 Mohammed:8 Md:2 Abu:3 Shamsul:2 Nurul:3 Jalal:2 Monir:3 Rafique:2 Mizanur:2 Shahidul:2 Kamal:3 Habib:2 Ruhul:2 Moin:2'),
           mid: w('Rahim:3 Faruk:3 Shahin:3 Jewel:3 Anwar:3 Sohel:3 Sabbir:3 Masum:3 Rubel:3 Rony:3 Tanvir:3 Mamun:3 Imran:4 Shafiq:3 Mahbub:3 Rashed:3 Alamgir:2'),
           young: w('Rayhan:4 Adnan:4 Tahmid:3 Ayaan:3 Ibrahim:4 Zayn:3 Rafi:3 Samiul:3 Nafis:3 Fahim:3 Yusuf:4 Ahnaf:3 Ismail:3 Mahir:3 Tawsif:2 Ariyan:2 Ryan:2') },
      F: { old: w('Rahima:3 Salma:4 Rokeya:3 Hasina:3 Shahana:3 Rehana:3 Jahanara:2 Monowara:2 Nazma:3 Shirin:3 Fatema:3 Khadiza:3 Ferdousi:2'),
           mid: w('Nasima:3 Rumana:3 Shamima:3 Farhana:4 Tahmina:3 Sharmin:3 Jesmin:3 Mahmuda:3 Sultana:3 Nusrat:3 Tasnim:3 Sumi:2 Runa:3 Shapla:2 Afroza:2 Ruma:3 Mahfuza:2'),
           young: w('Tasnia:3 Maisha:4 Nafisa:3 Jannat:3 Rifa:3 Anika:3 Sumaiya:3 Aminah:3 Tahiya:3 Zara:3 Ayesha:4 Maryam:4 Samiha:3 Nusaiba:2 Ishrat:2 Raisa:3 Fariha:3') },
    },
    last: w('Ahmed:8 Begum:0 Khan:5 Hussain:5 Islam:6 Uddin:6 Miah:7 Rahman:7 Chowdhury:6 Ali:5 Hossain:5 Alam:5 Haque:4 Khatun:0 Akter:0 Mia:3 Karim:3 Siddique:3 Talukdar:2 Ullah:3'), fem: 'begum',
  },
  chinese: {
    label: 'Chinese', birth: { uk: 0.25, other: [['China', 60], ['Hong Kong', 18], ['Malaysia', 7], ['Singapore', 3], ['Taiwan', 4], ['Vietnam', 3], ['Hong Kong (BNO)', 5]] },
    // anglicised given name used by many UK-born / students; native given names for older & recent arrivals
    first: {
      M: { old: w('Wing:3 Kwok:3 Chi:3 Kin:2 Ho:3 Man:3 Cheung:1 David:3 Peter:2 Simon:2 Kevin:3 Raymond:3 Danny:2 Eric:2'), mid: w('Wei:4 Jun:3 Jian:3 Lei:3 Tao:3 Ming:3 Chun:3 Kenneth:3 Alan:3 Jason:3 Andy:2 Michael:3 Edmund:2 Jimmy:2'), young: w('Yifan:3 Haoran:3 Zihan:3 Junjie:3 Ethan:4 Ryan:3 Kai:4 Leo:3 Jason:3 Marcus:2 Jonathan:2 Wesley:2 Henry:3 Lucas:3') },
      F: { old: w('Mei:3 Ling:3 Lai:2 Yuk:2 Sau:2 Kit:2 Wai:2 Helen:3 Susan:2 Anna:2 Mary:3 Winnie:3 Annie:2 Elaine:2'), mid: w('Xiaoli:3 Yan:3 Jing:3 Hui:3 Fang:3 Li:3 Ying:3 Karen:3 Jenny:3 Vivian:3 Cindy:3 Angela:3 Christine:3 Emily:3'), young: w('Yuxin:3 Xinyi:3 Ziyi:3 Jiayi:3 Wenjing:2 Emily:4 Chloe:3 Amy:3 Sophie:3 Katie:3 Michelle:3 Alice:3 Yvonne:2 Tiffany:2') },
    },
    last: w('Chen:6 Wang:5 Li:6 Zhang:5 Liu:5 Yang:3 Huang:3 Zhao:3 Wu:4 Zhou:3 Xu:2 Sun:2 Ma:2 Zhu:2 Lin:4 Cheung:4 Chan:5 Wong:5 Lee:5 Ng:4 Lam:3 Leung:3 Tang:3 Yip:2 Ho:3 Tan:3 Lau:2 Cheng:3 Fung:2 Szeto:1'),
    surnameFirst: true,
  },
  other_asian: {
    label: 'Other Asian (Sri Lankan, Nepali, Filipino, Vietnamese, Afghan, Arab-Asian, Korean, Japanese, Thai...)', birth: { uk: 0.2, other: [['Sri Lanka', 14], ['Nepal', 12], ['Philippines', 14], ['Vietnam', 8], ['Afghanistan', 10], ['Iran', 6], ['Korea', 6], ['Japan', 4], ['Thailand', 6], ['Malaysia', 4], ['Sri Lanka (Tamil)', 10], ['Indonesia', 3], ['Iraq (Kurdish)', 3]] },
    sub: {
      tamil_sinhala: { w: 24, first: { M: w('Suresh:3 Kumar:3 Thevan:2 Prasanna:3 Nimal:3 Kasun:3 Sivakumar:2 Arun:3 Dinesh:3 Lahiru:2 Ravi:3'), F: w('Priya:3 Anusha:3 Kavitha:3 Nirmala:3 Shalini:3 Dilani:3 Thushari:2 Nithya:3 Sangeetha:3 Yasodha:2') }, last: w('Perera:4 Fernando:4 Silva:3 Jayasinghe:2 Wickramasinghe:2 Rajaratnam:3 Sivalingam:3 Thavarajah:2 Selvarajah:3 Kanagaratnam:2 Pillai:3') },
      nepali: { w: 14, first: { M: w('Bikash:3 Sujan:3 Prakash:3 Ramesh:3 Binod:3 Roshan:3 Anil:3 Dipak:2 Suman:3 Nabin:3'), F: w('Sita:3 Anita:3 Sunita:3 Sabina:3 Rina:3 Pooja:3 Sarita:3 Kabita:3 Mina:3 Asmita:2') }, last: w('Gurung:5 Rai:4 Limbu:3 Thapa:4 Magar:4 Tamang:3 Shrestha:4 Sherpa:2 Adhikari:3 Karki:3 Gurung:2') },
      filipino: { w: 14, first: { M: w('Jose:4 Mark:3 John:3 Jerome:3 Arnel:2 Ramon:3 Carlo:3 Joel:3 Mario:2 Rey:3'), F: w('Maria:4 Joy:3 Grace:3 Maricel:3 Jocelyn:3 Rowena:3 Angelica:3 Rosalie:2 Jennifer:3 Cristina:3 Mary_Ann:2') }, last: w('Santos:4 Reyes:4 Cruz:4 Bautista:3 Garcia:3 Ramos:3 Mendoza:3 Flores:3 Aquino:2 Dela_Cruz:3 Villanueva:2 Castillo:2') },
      sea_east: { w: 18, first: { M: w('Minh:3 Hung:3 Duc:3 Tuan:3 Quang:3 Min-jun:3 Hiroshi:2 Kenji:2 Somchai:3 Anan:2 Budi:2 Ahmad:2'), F: w('Linh:3 Hoa:3 Mai:3 Thao:3 Lan:3 Ji-woo:3 Yuki:3 Mika:3 Mali:3 Nok:2 Siti:3 Nurul:2') }, last: w('Nguyen:7 Tran:4 Le:3 Pham:3 Kim:4 Park:3 Lee:3 Tanaka:2 Sato:2 Suzuki:2 Wong:0 Srisai:2 Wijaya:2') },
      afghan_iranian_kurdish: { w: 30, first: { M: w('Ahmad:4 Mohammad:4 Farid:3 Hamid:3 Rahim:3 Reza:4 Ali:4 Hossein:3 Kaveh:3 Dara:3 Azad:3 Hemin:3 Karwan:2 Sina:3'), F: w('Fatima:3 Zarina:3 Mina:3 Roya:3 Shirin:3 Maryam:4 Leila:3 Sara:3 Shadi:3 Narin:3 Hevi:2 Zhila:2 Parisa:3') }, last: w('Ahmadi:4 Hashemi:3 Karimi:3 Rahimi:3 Noori:3 Sadeghi:3 Hosseini:4 Mohammadi:4 Rezaei:3 Ghafari:2 Barzani:2 Hamad:3 Shirzad:2') },
    },
  },
  african: {
    label: 'Black African (Nigerian, Ghanaian, Somali, Zimbabwean, Eritrean, Congolese, Sierra Leonean, Kenyan...)', birth: { uk: 0.38, other: [['Nigeria', 24], ['Ghana', 12], ['Somalia', 14], ['Zimbabwe', 7], ['Eritrea', 6], ['Sudan', 5], ['Democratic Republic of Congo', 5], ['Sierra Leone', 4], ['Kenya', 5], ['Uganda', 3], ['South Africa', 3], ['Cameroon', 3], ['Ethiopia', 5], ['Angola', 3], ['Zambia', 2]] },
    sub: {
      nigerian: { w: 24, first: { M: w('Emeka:3 Chukwuemeka:3 Oluwaseun:4 Tunde:3 Segun:3 Chidi:3 Ifeanyi:3 Kehinde:2 Femi:3 Tobi:4 David:3 Samuel:3 Daniel:3 Michael:3 Chinedu:3 Kelechi:2 Obinna:3'), F: w('Chioma:3 Adaeze:3 Funmi:3 Folake:3 Ngozi:3 Amaka:3 Bukola:3 Temitope:3 Blessing:4 Grace:3 Favour:3 Ifeoma:3 Nkechi:2 Yetunde:3 Esther:3 Ruth:3') }, last: w('Okafor:4 Adeyemi:4 Okonkwo:4 Balogun:3 Adebayo:4 Ogunleye:3 Eze:3 Nwosu:3 Olawale:3 Abiodun:2 Ibrahim:2 Mensah:0 Chukwu:3 Obi:3 Ojo:3 Adeleke:3 Akinyemi:3') },
      ghanaian: { w: 12, first: { M: w('Kwame:3 Kofi:3 Kwesi:3 Yaw:3 Kwabena:3 Nana:3 Emmanuel:4 Samuel:3 Isaac:3 Kojo:3 Prince:2 Daniel:3'), F: w('Ama:3 Akosua:3 Abena:3 Efua:3 Adwoa:3 Esi:3 Grace:3 Gifty:3 Comfort:3 Mavis:3 Patience:3 Abigail:3') }, last: w('Mensah:5 Owusu:4 Asante:4 Boateng:4 Osei:4 Appiah:3 Agyeman:3 Addo:3 Ofori:3 Danso:3 Amoah:3 Quaye:2 Tetteh:2') },
      somali: { w: 14, first: { M: w('Abdi:4 Mohamed:5 Ahmed:4 Abdullahi:4 Hassan:4 Ali:4 Yusuf:4 Ismail:3 Mahad:3 Liban:3 Warsame:2 Abdirahman:3 Farah:3 Omar:4'), F: w('Fatuma:4 Hodan:4 Ifrah:4 Amina:4 Maryan:4 Ayan:3 Sagal:3 Hawa:3 Khadra:3 Nimco:3 Safiya:3 Sahra:3 Ubah:2 Zamzam:3') }, last: w('Abdi:5 Mohamud:4 Hassan:4 Ali:4 Ahmed:4 Warsame:3 Omar:4 Ibrahim:3 Farah:3 Yusuf:3 Jama:3 Egal:2 Osman:3 Nur:3 Hirsi:2 Dahir:2 Isse:2') },
      horn_central_southern: { w: 50, first: { M: w('Daniel:3 Samuel:3 Tesfay:3 Dawit:3 Yonas:3 Mulugeta:2 Robert:3 Tendai:3 Tafara:3 Tatenda:3 Blessing:2 Joseph:3 John:3 Patrick:3 Moses:3 Brian:3 Kevin:3 Jean:3 Pierre:2 Mamadou:2 Ibrahim:3 Mohamed:3 Alusine:2 Sheku:2'), F: w('Selam:3 Hanna:3 Meron:3 Tsion:3 Rudo:3 Chipo:3 Tendai:3 Nyasha:3 Rutendo:3 Faith:3 Mercy:3 Joy:3 Grace:3 Beatrice:3 Mary:3 Esther:3 Marie:3 Aminata:2 Fatmata:2 Mariatu:2') }, last: w('Tesfaye:3 Haile:3 Gebre:3 Bekele:3 Moyo:4 Ncube:3 Dube:3 Chikwanha:2 Sibanda:3 Moyo:2 Kamau:3 Otieno:3 Mwangi:3 Njoroge:3 Mukasa:2 Kamara:4 Sesay:3 Bangura:3 Koroma:3 Kabila:2 Mbala:2 Ndiaye:2 Musa:3 Banda:3') },
    },
  },
  caribbean: {
    label: 'Black Caribbean / Black British', birth: { uk: 0.8, other: [['Jamaica', 48], ['Barbados', 10], ['Trinidad and Tobago', 10], ['Grenada', 7], ['St Lucia', 7], ['Guyana', 8], ['Dominica', 4], ['Antigua', 3], ['St Vincent', 3]] },
    first: {
      M: { old: w('Winston:4 Clive:3 Delroy:3 Lloyd:3 Devon:3 Courtney:3 Errol:3 Desmond:3 Trevor:3 Donovan:3 Leroy:3 Everton:2 Paul:3 Michael:4 Colin:2 Carl:3 Vernon:2'), mid: w('Marcus:4 Jermaine:3 Dwayne:3 Andre:3 Anthony:4 Wayne:3 Craig:3 Leon:3 Troy:3 Kevin:3 Ricardo:2 Junior:2 Shaun:3 Dean:3 Ashley:2 Jason:3'), young: w('Jaden:3 Jayden:3 Malachi:3 Josiah:3 Elijah:4 Isaiah:3 Kai:3 Tyrone:2 Xavier:3 Noah:3 Joshua:3 Zion:3 Theo:3 Rio:2 Kyron:2 Jamal:2') },
      F: { old: w('Beverley:4 Marcia:3 Paulette:3 Pauline:3 Merle:2 Hyacinth:2 Claudette:3 Sonia:3 Yvonne:3 Jennifer:3 Marlene:3 Gloria:3 Joan:2 Cecile:2 Veronica:3 Maxine:3'), mid: w('Nicola:3 Natasha:4 Tracey:3 Michelle:4 Sharon:3 Donna:3 Keisha:3 Shanice:3 Danielle:3 Simone:3 Kerry-Ann:2 Tanya:3 Jade:3 Latoya:3 Sasha:2 Leanne:3'), young: w('Amara:3 Imani:3 Nia:3 Zara:3 Jasmine:3 Tiana:3 Kayla:3 Aaliyah:3 Chloe:3 Ruby:3 Jada:3 Maya:3 Skye:2 Amani:2 Kiara:3 Tianna:2') },
    },
    last: w('Brown:6 Williams:6 Campbell:5 Thomas:4 Smith:4 Johnson:4 Clarke:4 Henry:4 Edwards:3 Reid:4 Francis:3 Samuels:3 Bailey:3 Morgan:3 Grant:3 Davis:3 Gordon:3 Lewis:3 McKenzie:3 Blake:3 Richards:3 James:3 Mills:2 Walker:3 Allen:3 Baptiste:3 Joseph:3 Charles:2 Sinclair:2 Wright:2'),
  },
  mixed: { label: 'Mixed / multiple ethnic groups', mix: [['white_british', 'caribbean', 30], ['white_british', 'african', 14], ['white_british', 'indian', 8], ['white_british', 'pakistani', 8], ['white_british', 'bangladeshi', 2], ['white_british', 'chinese', 5], ['other_white', 'caribbean', 5], ['white_british', 'other_asian', 5], ['other_white', 'african', 3], ['caribbean', 'african', 4], ['white_british', 'other_white', 12], ['other_white', 'indian', 2], ['white_british', 'arab_other', 2]], birth: { uk: 0.88, other: [['Various', 1]] } },
  other: {
    label: 'Other ethnic group (Arab, Latin American, Kurdish, Turkish, Iranian, Filipino listed separately...)', birth: { uk: 0.3, other: [['Iraq', 10], ['Syria', 9], ['Libya', 4], ['Yemen', 4], ['Egypt', 5], ['Morocco', 4], ['Algeria', 3], ['Iran', 8], ['Turkey', 9], ['Colombia', 7], ['Brazil', 8], ['Ecuador', 3], ['Peru', 3], ['Venezuela', 3], ['Kuwait', 2], ['Lebanon', 4], ['Sudan', 2]] },
    sub: {
      arab: { w: 50, first: { M: w('Mohammed:5 Ahmed:4 Omar:4 Khaled:3 Hussein:3 Mustafa:3 Youssef:4 Karim:3 Samir:3 Tariq:3 Hassan:3 Ali:4 Ibrahim:4 Adam:3 Walid:2'), F: w('Fatima:4 Noor:3 Layla:4 Mariam:4 Aya:4 Rana:3 Dina:3 Hiba:3 Samira:3 Zeinab:3 Salma:3 Yasmin:4 Amal:3 Rania:3') }, last: w('Al-Hassan:3 Hussein:4 Mansour:3 Haddad:3 Khalil:3 Saleh:3 Abdullah:3 Al-Sayed:3 Mahmoud:3 Nasser:3 Darwish:2 Aziz:3 Barakat:2 Ben_Ali:2 Bouzid:2 Mansouri:2') },
      turkish_kurdish: { w: 20, first: { M: w('Mehmet:4 Mustafa:4 Emre:3 Murat:3 Ahmet:3 Burak:3 Can:3 Cem:3 Hasan:3 Serkan:2 Baran:3 Azad:2'), F: w('Ayşe:4 Fatma:4 Elif:4 Zeynep:4 Esra:3 Merve:3 Selin:3 Derya:2 Emine:3 Hatice:3 Gül:3 Nur:3') }, last: w('Yılmaz:5 Kaya:4 Demir:4 Şahin:4 Çelik:4 Öztürk:3 Aydın:3 Arslan:3 Doğan:3 Kılıç:3 Yıldız:3 Aksoy:3') },
      latin_american: { w: 30, first: { M: w('Carlos:4 Juan:4 Luis:4 Andrés:3 Santiago:3 Mateo:3 Diego:3 Felipe:3 Gabriel:3 Rafael:3 Daniel:3 Camilo:3'), F: w('María:4 Camila:4 Valentina:4 Daniela:3 Natalia:3 Andrea:3 Gabriela:3 Carolina:3 Juliana:3 Sofía:4 Luciana:3 Paula:3') }, last: w('Gómez:4 Rodríguez:4 Martínez:4 López:3 Hernández:3 Pérez:3 Ramírez:3 Torres:3 Díaz:3 Morales:3 Silva:3 Souza:3 Oliveira:3 Santos:2') },
    },
  },
};
// Birth countries consistent with a name sub-origin (used instead of the group-level birth list when the group has sub-origins).
export const SUB_BIRTH = {
  polish: [['Poland', 1]], romanian: [['Romania', 1]], italian: [['Italy', 1]], irish: [['Ireland', 1]], iberian: [['Portugal', 5], ['Spain', 4]],
  baltic: [['Lithuania', 5], ['Latvia', 3]], balkan_slavic: [['Bulgaria', 4], ['Slovakia', 2], ['Ukraine', 3], ['Albania', 2], ['Czechia', 2]], western_eu: [['Germany', 3], ['France', 3], ['Netherlands', 2], ['Sweden', 1], ['Belgium', 1]],
  punjabi_sikh: [['India', 8], ['Kenya', 1], ['Uganda', 1]], gujarati: [['India', 6], ['Kenya', 3], ['Uganda', 2], ['Tanzania', 2]], other_indian: [['India', 9], ['UAE', 1], ['Singapore', 1]],
  tamil_sinhala: [['Sri Lanka', 1]], nepali: [['Nepal', 1]], filipino: [['Philippines', 1]], sea_east: [['Vietnam', 4], ['South Korea', 3], ['Japan', 2], ['Thailand', 3], ['Malaysia', 2], ['Indonesia', 1]], afghan_iranian_kurdish: [['Afghanistan', 4], ['Iran', 4], ['Iraq', 3]],
  nigerian: [['Nigeria', 1]], ghanaian: [['Ghana', 1]], somali: [['Somalia', 3], ['Kenya', 1], ['Ethiopia', 1]], horn_central_southern: [['Eritrea', 3], ['Ethiopia', 3], ['Zimbabwe', 4], ['Kenya', 3], ['Democratic Republic of Congo', 3], ['Sierra Leone', 3], ['Uganda', 2], ['Zambia', 2], ['Cameroon', 2], ['South Africa', 2], ['Sudan', 2]],
  arab: [['Iraq', 4], ['Syria', 4], ['Egypt', 3], ['Libya', 2], ['Yemen', 2], ['Morocco', 3], ['Algeria', 2], ['Lebanon', 2], ['Kuwait', 1], ['Sudan', 1]], turkish_kurdish: [['Turkey', 4], ['Iraq', 1], ['Cyprus', 1]], latin_american: [['Colombia', 4], ['Brazil', 4], ['Ecuador', 2], ['Peru', 2], ['Venezuela', 2]],
};
// Religion for sub-origins where it differs sharply from the group prior (overrides RELIGION_BY_GROUP[group] when present).
export const RELIGION_BY_SUB = {
  punjabi_sikh: { Sikh: 0.85, Hindu: 0.07, 'No religion': 0.03, Christian: 0.02, Muslim: 0.0, Other: 0.03 },
  gujarati: { Hindu: 0.78, Muslim: 0.12, Christian: 0.03, 'No religion': 0.04, Other: 0.03 },
  other_indian: { Hindu: 0.45, Muslim: 0.15, Christian: 0.15, 'No religion': 0.08, Sikh: 0.08, Buddhist: 0.02, Other: 0.07 },
  tamil_sinhala: { Hindu: 0.45, Buddhist: 0.3, Christian: 0.12, Muslim: 0.08, 'No religion': 0.04, Other: 0.01 },
  nepali: { Hindu: 0.5, Buddhist: 0.3, Christian: 0.1, 'No religion': 0.08, Other: 0.02 },
  filipino: { Christian: 0.92, 'No religion': 0.05, Muslim: 0.02, Other: 0.01 },
  sea_east: { Buddhist: 0.4, 'No religion': 0.3, Christian: 0.25, Muslim: 0.05 },
  afghan_iranian_kurdish: { Muslim: 0.86, 'No religion': 0.08, Christian: 0.04, Other: 0.02 },
  nigerian: { Christian: 0.7, Muslim: 0.25, 'No religion': 0.03, Other: 0.02 }, ghanaian: { Christian: 0.88, Muslim: 0.08, 'No religion': 0.03, Other: 0.01 }, somali: { Muslim: 0.99, Other: 0.01 },
  horn_central_southern: { Christian: 0.62, Muslim: 0.3, 'No religion': 0.06, Other: 0.02 }, arab: { Muslim: 0.85, Christian: 0.08, 'No religion': 0.06, Other: 0.01 },
  turkish_kurdish: { Muslim: 0.85, 'No religion': 0.1, Christian: 0.03, Other: 0.02 }, latin_american: { Christian: 0.75, 'No religion': 0.2, Muslim: 0.01, Other: 0.04 },
  polish: { Christian: 0.8, 'No religion': 0.18, Other: 0.02 }, romanian: { Christian: 0.85, 'No religion': 0.12, Other: 0.03 }, italian: { Christian: 0.65, 'No religion': 0.33, Other: 0.02 }, iberian: { Christian: 0.62, 'No religion': 0.35, Other: 0.03 },
};
export const ARAB_OTHER_ALIAS = 'other'; // 'arab_other' parent in a Mixed mix resolves to the Other group, sub 'arab'

// Religion conditional on origin group (shares of "stated" religion mix), nudged so the whole population matches calibration.religion when weighted by group share.
// These are DESIGN priors for the founding generator, which should rebalance to calibration.religion. Keys: No religion, Christian, Muslim, Hindu, Sikh, Buddhist, Jewish, Other.
// Religion conditional on ethnic group = the joint distribution (ONS Census 2021 RM031 'Ethnic group by religion', England & Wales; rounded, urban-skewed: e.g. Indian ~49% Hindu / ~21% Sikh /
// ~15% Muslim, Pakistani & Bangladeshi >90% Muslim, Black African ~60% Christian / ~30% Muslim, Chinese ~55% no religion / ~15% Buddhist). Sampling is ethnicity first, then religion given
// ethnicity (and sub-origin where it differs sharply), then household correlation (children/partners take a parent's/partner's) -- never independent draws.
export const RELIGION_BY_GROUP = {
  white_british: { 'No religion': 0.5, Christian: 0.44, Muslim: 0.004, Hindu: 0.002, Sikh: 0.002, Buddhist: 0.007, Jewish: 0.003, Other: 0.04 },
  other_white: { 'No religion': 0.32, Christian: 0.55, Muslim: 0.05, Hindu: 0.002, Sikh: 0.001, Buddhist: 0.01, Jewish: 0.015, Other: 0.05 },
  indian: { 'No religion': 0.04, Christian: 0.06, Muslim: 0.12, Hindu: 0.40, Sikh: 0.35, Buddhist: 0.005, Jewish: 0, Other: 0.025 },
  pakistani: { 'No religion': 0.015, Christian: 0.015, Muslim: 0.96, Hindu: 0, Sikh: 0.001, Buddhist: 0, Jewish: 0, Other: 0.009 },
  bangladeshi: { 'No religion': 0.015, Christian: 0.01, Muslim: 0.97, Hindu: 0.003, Sikh: 0, Buddhist: 0.001, Jewish: 0, Other: 0.001 },
  chinese: { 'No religion': 0.58, Christian: 0.16, Muslim: 0.01, Hindu: 0.003, Sikh: 0, Buddhist: 0.22, Jewish: 0, Other: 0.027 },
  other_asian: { 'No religion': 0.12, Christian: 0.2, Muslim: 0.35, Hindu: 0.15, Sikh: 0.01, Buddhist: 0.15, Jewish: 0, Other: 0.02 },
  african: { 'No religion': 0.06, Christian: 0.66, Muslim: 0.26, Hindu: 0.002, Sikh: 0, Buddhist: 0.002, Jewish: 0, Other: 0.016 },
  caribbean: { 'No religion': 0.2, Christian: 0.74, Muslim: 0.02, Hindu: 0, Sikh: 0, Buddhist: 0.005, Jewish: 0, Other: 0.035 },
  mixed: { 'No religion': 0.42, Christian: 0.44, Muslim: 0.09, Hindu: 0.01, Sikh: 0.01, Buddhist: 0.01, Jewish: 0.002, Other: 0.018 },
  other: { 'No religion': 0.1, Christian: 0.12, Muslim: 0.69, Hindu: 0.002, Sikh: 0, Buddhist: 0.005, Jewish: 0, Other: 0.083 },
};
// calibration.ethnicity.detail label -> group key (+ share). `Mixed` and `Other` come from calibration.ethnicity.shares.
export const ETHNICITY_TO_GROUP = { 'White British': 'white_british', 'Other White': 'other_white', Indian: 'indian', Pakistani: 'pakistani', Bangladeshi: 'bangladeshi', Chinese: 'chinese', 'Other Asian': 'other_asian', African: 'african', Caribbean: 'caribbean', Mixed: 'mixed', 'Other (incl Arab)': 'other' };

const cohortOf = (birthYear) => (birthYear < 1965 ? 'old' : birthYear < 1991 ? 'mid' : 'young');
const pickW = (rng, list) => { let t = 0; for (const [, k] of list) t += k; let r = rng.next() * t; for (const [n, k] of list) { r -= k; if (r <= 0) return n; } return list[list.length - 1][0]; };
const surfaceName = (s) => s.replace(/^(Dela|De|Al|Ben)[ _-]/, (m) => m.replace('_', ' ')).replace(/_/g, ' ');
const fixup = (s) => ({ OBrien: "O'Brien", OConnor: "O'Connor", 'Dela Cruz': 'dela Cruz' }[s] || s);
const firstFrom = (src, sex, cohort) => { const t = src.first[sex]; return t.old ? t[cohort] : t; };
function resolveGroup(rng, groupKey) {
  if (groupKey === 'mixed') { const mix = GROUPS.mixed.mix; const [a, b] = (() => { const pick = pickW(rng, mix.map((m, i) => [i, m[2]])); return [mix[pick][0], mix[pick][1]]; })(); return [rng.chance(0.5) ? a : b, rng.chance(0.5) ? a : b]; }
  return [groupKey, groupKey];
}
/** Pick a person's origin from their ethnicity group key (ETHNICITY_TO_GROUP value): {group, sub, bornUK, birthplace, firstGroup, lastGroup}. */
export function pickOrigin(rng, groupKey, birthYear = 1990) {
  let [fg, lg] = resolveGroup(rng, groupKey);
  if (fg === 'arab_other') fg = 'other'; if (lg === 'arab_other') lg = 'other';
  const gg = GROUPS[groupKey];
  const eff = Math.min(0.98, gg.birth.uk + (birthYear >= 2005 ? 0.25 : birthYear >= 1995 ? 0.1 : 0)); // young people more often UK-born
  const bornUK = rng.chance(eff);
  const src = GROUPS[lg === 'arab_other' ? 'other' : lg];
  const sub = src.sub ? pickW(rng, Object.entries(src.sub).map(([k, v]) => [k, v.w])) : null;
  const bp = bornUK ? 'United Kingdom' : pickW(rng, (sub && SUB_BIRTH[sub]) || gg.birth.other);
  return { group: groupKey, sub, bornUK, birthplace: bp, firstGroup: fg, lastGroup: lg };
}
/** Pick {first, last, full} for an origin + sex ('M'|'F') + birthYear. Heterogeneous families keep one surname; call once per household, then use pickFirst for children. */
export function pickName(rng, origin, sex, birthYear = 1990) {
  const first = pickFirst(rng, origin, sex, birthYear); const last = pickSurname(rng, origin, sex);
  return { first, last, full: `${first} ${last}` };
}
export function pickFirst(rng, origin, sex, birthYear = 1990) {
  const g = GROUPS[origin.firstGroup] || GROUPS[origin.group]; const src = g.sub ? (g.sub[origin.sub] || g.sub[Object.keys(g.sub)[0]]) : g;
  return fixup(surfaceName(pickW(rng, firstFrom(src, sex, cohortOf(birthYear)))));
}
export function pickSurname(rng, origin, sex) {
  const g = GROUPS[origin.lastGroup] || GROUPS[origin.group]; const src = g.sub ? (g.sub[origin.sub] || g.sub[Object.keys(g.sub)[0]]) : g;
  let l = pickW(rng, src.last.filter(([, k]) => k > 0)); l = fixup(surfaceName(l));
  if (src.fem === 'kaur' && sex === 'F') return 'Kaur'; if (src.fem === 'begum' && sex === 'F' && rng.chance(0.55)) return 'Begum';
  if (src.fem && typeof src.fem === 'object' && sex === 'F') l = src.fem[l] || l;
  return l;
}
export default { GROUPS, SUB_BIRTH, RELIGION_BY_SUB, RELIGION_BY_GROUP, ETHNICITY_TO_GROUP, pickOrigin, pickName, pickFirst, pickSurname };
