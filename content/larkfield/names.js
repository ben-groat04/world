// Origin-conditioned names for Larkfield. DATA + a tiny pure picker (takes a sim RNG; no Math.random).
// Groups follow calibration.ethnicity.detail plus Mixed and Other. Names are common real names for that background in UK inner cities; ethnicity never
// implies occupation, religion, or behaviour here (the sim keeps religion as its own draw, with the conditional tables in RELIGION_BY_GROUP).
// first names: {M:[[name, weight]...] per cohort: 'old' (born <1965), 'mid' (1965-1990), 'young' (1991+)}.  Weights are relative.
const w = (s) => s.split(/\s+/).filter(Boolean).map((x) => { const [n, k] = x.split(':'); return [n.replace(/_/g, ' '), k ? +k : 1]; });
// Sub-origin builder: S(weight, maleFirst, femaleFirst, surnames, extra). extra.fem = feminine surname forms; extra.conv = 'patronymic' (surname = father's given name).
const S = (wt, M, F, last, extra = {}) => ({ w: wt, first: { M: w(M), F: w(F) }, last: w(last), ...extra });
const ltFem = (s) => Object.fromEntries(s.split(' ').map((l) => [l, [l.replace(/as$/, 'ienė'), l.replace(/as$/, 'aitė')]])); // Lithuanian: married -ienė / unmarried -aitė
const slavFem = (s) => Object.fromEntries(s.split(' ').map((l) => [l, l + 'a'])); // Russian/Bulgarian -ov -> -ova, -ev -> -eva
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

      // Split by naming tradition (each draw is one sub-origin: first name, surname and birthplace all come from it). Weights = the old pooled weight split by the
      // country-of-birth weights in this group's `birth.other` (ONS Census 2021 TS012 shape for inner-city England).
      lithuanian: S(4.5, 'Tomas:4 Andrius:4 Mantas:3 Dainius:3 Rokas:4 Mindaugas:3 Gediminas:3 Paulius:3 Darius:3 Linas:3 Justas:3', 'Ieva:4 Rasa:3 Gintarė:3 Laura:3 Agnė:3 Rūta:3 Jolanta:3 Eglė:3 Inga:3 Greta:3 Austėja:2', 'Kazlauskas:4 Petrauskas:4 Jankauskas:3 Navickas:2 Paulauskas:3 Žukauskas:3 Vasiliauskas:3 Balčiūnas:2', { fem: ltFem('Kazlauskas Petrauskas Jankauskas Navickas Paulauskas Žukauskas Vasiliauskas Balčiūnas') }),
      latvian: S(1.5, 'Jānis:4 Artūrs:3 Kristaps:3 Andris:3 Mārtiņš:3 Edgars:3 Raimonds:2 Rihards:3', 'Līga:4 Inese:3 Anda:3 Ilze:3 Evija:3 Laura:2 Dace:3 Zane:3', 'Bērziņš:4 Kalniņš:4 Ozols:3 Jansons:3 Liepiņš:3 Krūmiņš:2 Ozoliņš:3', { fem: { Bērziņš: 'Bērziņa', Kalniņš: 'Kalniņa', Ozols: 'Ozola', Jansons: 'Jansone', Liepiņš: 'Liepiņa', Krūmiņš: 'Krūmiņa', Ozoliņš: 'Ozoliņa' } }),
      bulgarian: S(1.8, 'Ivan:4 Georgi:4 Nikolay:3 Dimitar:3 Hristo:3 Petar:3 Stefan:3 Plamen:2 Kaloyan:2 Martin:2', 'Maria:3 Desislava:3 Elitsa:2 Ivanka:3 Radka:2 Svetlana:3 Yordanka:2 Gergana:3 Teodora:3 Nikoleta:3', 'Ivanov:5 Georgiev:4 Dimitrov:4 Petrov:4 Todorov:3 Stoyanov:3 Kolev:3 Angelov:3 Hristov:3 Iliev:2', { fem: slavFem('Ivanov Georgiev Dimitrov Petrov Todorov Stoyanov Kolev Angelov Hristov Iliev') }),
      czech_slovak: S(2.25, 'Jan:4 Petr:4 Jakub:4 Martin:4 Tomáš:4 Lukáš:3 Jozef:3 Peter:3 Marek:3 Michal:3 Ondřej:3', 'Jana:4 Eva:3 Lucie:3 Katarína:3 Lucia:3 Tereza:3 Zuzana:3 Petra:3 Veronika:3 Martina:3', 'Novák:5 Svoboda:4 Novotný:4 Dvořák:4 Černý:3 Procházka:3 Kováč:3 Baláž:2 Kučera:3 Král:2', { fem: { Novák: 'Nováková', Svoboda: 'Svobodová', Novotný: 'Novotná', Dvořák: 'Dvořáková', Černý: 'Černá', Procházka: 'Procházková', Kováč: 'Kováčová', Baláž: 'Balážová', Kučera: 'Kučerová', Král: 'Králová' } }),
      hungarian: S(0.9, 'István:3 László:3 Gábor:3 Zoltán:3 Attila:3 Péter:4 Balázs:3 Tamás:3 Ádám:3 Dávid:3', 'Katalin:3 Éva:3 Zsuzsanna:3 Anikó:2 Judit:3 Réka:3 Nóra:3 Eszter:3 Dóra:3 Bernadett:2', 'Nagy:5 Kovács:5 Tóth:4 Szabó:4 Horváth:4 Varga:4 Kiss:3 Molnár:3 Németh:3 Farkas:2 Balogh:2 Papp:2'),
      albanian: S(0.9, 'Arben:3 Erion:3 Besnik:3 Ardit:3 Gent:2 Klodian:2 Altin:3 Dritan:3 Fatmir:2 Ilir:3 Genc:2', 'Mirela:3 Elona:3 Ermira:3 Arta:3 Blerina:3 Elira:3 Drita:2 Vjollca:2 Anila:3 Enkelejda:2', 'Hoxha:5 Shehu:3 Hysa:3 Dervishi:3 Krasniqi:3 Berisha:3 Gashi:2 Leka:2 Prifti:3 Rama:2 Kola:2 Zeqiri:2'),
      greek: S(0.9, 'Giorgos:4 Dimitris:4 Nikos:4 Kostas:3 Panagiotis:3 Christos:3 Andreas:4 Yiannis:3 Michalis:3 Stelios:2', 'Maria:5 Eleni:4 Georgia:3 Katerina:3 Sofia:3 Dimitra:3 Anna:3 Ioanna:3 Christina:3 Evangelia:2', 'Papadopoulos:5 Papadakis:3 Georgiou:5 Nikolaou:3 Dimitriou:4 Konstantinou:3 Ioannou:4 Christodoulou:3 Antoniou:3', { fem: { Papadopoulos: 'Papadopoulou', Papadakis: 'Papadaki', Nikolaou: 'Nikolaou', Dimitriou: 'Dimitriou', Konstantinou: 'Konstantinou', Ioannou: 'Ioannou', Christodoulou: 'Christodoulou', Antoniou: 'Antoniou', Georgiou: 'Georgiou' } }),
      russian: S(0.9, 'Alexander:4 Dmitry:4 Sergei:3 Andrei:4 Mikhail:3 Ivan:3 Nikolai:3 Pavel:3 Maxim:3 Vladimir:3 Artem:3', 'Anna:4 Olga:3 Elena:3 Natalia:3 Tatiana:3 Irina:3 Svetlana:3 Ekaterina:3 Yulia:3 Maria:3', 'Ivanov:4 Smirnov:4 Kuznetsov:3 Popov:3 Sokolov:3 Petrov:3 Volkov:3 Morozov:3 Novikov:3 Fedorov:3 Mikhailov:2', { fem: slavFem('Ivanov Smirnov Kuznetsov Popov Sokolov Petrov Volkov Morozov Novikov Fedorov Mikhailov') }),
      ukrainian: S(1.35, 'Oleksandr:4 Dmytro:4 Andriy:4 Taras:3 Volodymyr:3 Bohdan:3 Ihor:3 Yuriy:3 Mykola:3 Serhiy:3 Vasyl:3', 'Olena:4 Oksana:4 Natalia:3 Iryna:3 Kateryna:3 Tetiana:3 Yulia:3 Olha:3 Svitlana:3 Halyna:3', 'Kovalenko:4 Shevchenko:4 Melnyk:4 Bondarenko:3 Boyko:3 Tkachenko:3 Kovalchuk:3 Kravchenko:3 Oliynyk:3 Shevchuk:3 Polishchuk:2 Lysenko:2'),
      german: S(4, 'Thomas:3 Jonas:3 Felix:3 Matthias:3 Stefan:3 Michael:3 Sebastian:3 Florian:3 Tobias:3 Lukas:3 Jan:2 Markus:3', 'Anna:3 Julia:3 Lena:3 Katja:3 Laura:3 Eva:2 Sabine:3 Claudia:3 Anja:3 Lisa:3 Johanna:3', 'Müller:5 Schmidt:4 Schneider:4 Fischer:4 Weber:4 Meyer:3 Wagner:3 Becker:3 Schulz:3 Hoffmann:3 Koch:2 Richter:2 Wolf:2'),
      dutch_flemish: S(2, 'Jan:3 Pieter:3 Joris:3 Daan:3 Sven:3 Bram:3 Thijs:2 Lars:3 Maarten:3 Joost:3', 'Anna:3 Sanne:3 Marieke:3 Femke:3 Lotte:3 Eva:3 Iris:3 Fleur:3 Annemiek:2 Sophie:3', 'De_Vries:4 Jansen:5 Peeters:3 Van_Dijk:4 Bakker:4 Visser:3 Smit:3 Meijer:3 De_Jong:4 Van_den_Berg:3 Janssens:3 Maes:2'),
      nordic: S(2, 'Lars:3 Erik:3 Anders:3 Johan:3 Magnus:3 Henrik:3 Mikael:3 Nils:3 Jonas:3 Mads:2', 'Emma:3 Elin:3 Sofia:3 Astrid:3 Ingrid:3 Maja:3 Freja:3 Linnea:3 Sara:3 Karin:3', 'Larsen:4 Johansson:4 Andersson:4 Nilsson:3 Hansen:4 Pedersen:3 Karlsson:3 Eriksson:3 Olsen:3 Jensen:4 Lindqvist:2'),
      french: S(6, 'Pierre:4 Antoine:4 Nicolas:4 Julien:3 Thomas:3 Maxime:3 Mathieu:3 Florian:2 Guillaume:3 Romain:3 Hugo:3', 'Marie:4 Claire:3 Sophie:3 Camille:3 Julie:3 Charlotte:3 Élodie:3 Marion:3 Aurélie:2 Élise:2 Léa:3', 'Martin:5 Bernard:4 Dubois:4 Moreau:3 Laurent:3 Simon:3 Michel:3 Lefebvre:3 Leroy:3 Girard:2 Bonnet:2 Dupont:3'),
      anglosphere: S(6, 'Michael:4 Jason:3 Ryan:3 Brandon:3 Kyle:3 Tyler:3 Josh:3 Matt:3 Justin:3 Nathan:3 Chris:3', 'Jessica:4 Ashley:3 Megan:3 Taylor:3 Hannah:3 Lauren:3 Emily:3 Madison:2 Kayla:2 Brittany:2', 'Smith:5 Johnson:4 Miller:3 Davis:3 Wilson:4 Anderson:3 Taylor:3 Moore:3 Jackson:3 Thompson:3 Campbell:3 Mitchell:3'),
      portuguese: S(7, 'João:5 Pedro:4 Tiago:4 Miguel:4 Rui:3 Bruno:3 Nuno:3 Ricardo:4 André:4 Diogo:3 Filipe:3', 'Ana:6 Maria:5 Marta:4 Sofia:4 Inês:4 Catarina:4 Beatriz:3 Raquel:3 Joana:4 Rita:3 Carla:3', 'Silva:6 Santos:5 Ferreira:4 Pereira:4 Costa:4 Oliveira:4 Rodrigues:4 Martins:3 Sousa:3 Fernandes:3 Gonçalves:3 Gomes:3'),
      spanish: S(6, 'Javier:4 Carlos:5 David:3 Diego:3 Pablo:4 Jorge:3 Luis:3 Alejandro:4 Sergio:3 Álvaro:3 Adrián:3', 'Lucía:4 Carmen:4 Laura:3 Paula:3 Marta:4 Elena:4 Sara:3 Cristina:3 Irene:3 Pilar:2 Alba:3', 'García:5 Martínez:4 López:4 Fernández:4 Rodríguez:4 González:3 Sánchez:3 Pérez:3 Gómez:3 Martín:3 Jiménez:3 Ruiz:3 Hernández:3'),
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
    // Two naming traditions: Mandarin/pinyin (mainland, Taiwan) and Cantonese/HK-style romanisation (Hong Kong, Malaysia/Singapore Chinese, Vietnamese-Chinese). UK order = given name first.
    // Anglicised given names are common among UK-born / HK-BNO. Weights: old pooled draw split by birth-country weights (China 60 + Taiwan 4 : HK 23 + Malaysia/Singapore 10 + Vietnam 3).
    sub: {
      mainland_chinese: { w: 64, first: {
        M: { old: w('Wei:4 Jun:3 Jian:3 Lei:3 Tao:3 Ming:3 Qiang:3 Gang:3 Yong:3 Hua:2 Jie:3'), mid: w('Wei:4 Jun:3 Jian:3 Lei:3 Tao:3 Ming:3 Chao:3 Hao:3 Jason:2 Michael:2 Kevin:2 Andy:2'), young: w('Yifan:3 Haoran:3 Zihan:3 Junjie:3 Ethan:3 Kai:3 Leo:3 Jason:2 Henry:3 Lucas:3 Yuchen:3') },
        F: { old: w('Mei:3 Ling:3 Xiuying:3 Lihua:3 Yan:3 Hong:3 Fang:3 Juan:3 Ping:2'), mid: w('Xiaoli:3 Yan:3 Jing:3 Hui:3 Fang:3 Li:3 Ying:3 Min:3 Lily:2 Jenny:2 Cindy:2 Vivian:2'), young: w('Yuxin:3 Xinyi:3 Ziyi:3 Jiayi:3 Wenjing:2 Emily:3 Chloe:3 Amy:3 Sophie:3 Michelle:3 Alice:3') } },
        last: w('Chen:6 Wang:6 Li:6 Zhang:6 Liu:5 Yang:4 Huang:4 Zhao:3 Wu:4 Zhou:3 Xu:3 Sun:3 Ma:2 Zhu:3 Lin:4 Tang:2 Gao:2 He:3 Guo:2 Luo:2') },
      cantonese_hk: { w: 36, first: {
        M: { old: w('Wing:3 Kwok:3 Chi:3 Kin:2 Ho:3 Man:3 David:3 Peter:2 Simon:2 Kevin:3 Raymond:3 Danny:2 Eric:2'), mid: w('Chun:3 Ming:3 Kenneth:3 Alan:3 Jason:3 Andy:2 Michael:3 Edmund:2 Jimmy:2 Kelvin:3 Ivan:2'), young: w('Ethan:4 Ryan:3 Kai:4 Leo:3 Jason:3 Marcus:2 Jonathan:2 Wesley:2 Henry:3 Lucas:3 Hin:2') },
        F: { old: w('Mei:3 Lai:3 Yuk:2 Sau:2 Kit:2 Wai:3 Helen:3 Susan:2 Anna:2 Mary:3 Winnie:3 Annie:2 Elaine:2'), mid: w('Yan:3 Karen:3 Jenny:3 Vivian:3 Cindy:3 Angela:3 Christine:3 Emily:3 Mandy:2 Sandy:2 Wing:2'), young: w('Emily:4 Chloe:3 Amy:3 Sophie:3 Katie:3 Michelle:3 Alice:3 Yvonne:2 Tiffany:2 Hoi:2 Sze:2') } },
        last: w('Cheung:5 Chan:7 Wong:7 Lee:6 Ng:4 Lam:4 Leung:4 Tang:3 Yip:2 Ho:3 Lau:3 Cheng:3 Fung:2 Szeto:1 Chow:3 Yeung:3 Tsang:2 Chu:2 Kwok:2 Tan:2') },
    },
  },
  other_asian: {
    label: 'Other Asian (Sri Lankan, Nepali, Filipino, Vietnamese, Afghan, Arab-Asian, Korean, Japanese, Thai...)', birth: { uk: 0.2, other: [['Sri Lanka', 14], ['Nepal', 12], ['Philippines', 14], ['Vietnam', 8], ['Afghanistan', 10], ['Iran', 6], ['Korea', 6], ['Japan', 4], ['Thailand', 6], ['Malaysia', 4], ['Sri Lanka (Tamil)', 10], ['Indonesia', 3], ['Iraq (Kurdish)', 3]] },
    sub: {
      tamil_sinhala: { w: 24, first: { M: w('Suresh:3 Kumar:3 Thevan:2 Prasanna:3 Nimal:3 Kasun:3 Sivakumar:2 Arun:3 Dinesh:3 Lahiru:2 Ravi:3'), F: w('Priya:3 Anusha:3 Kavitha:3 Nirmala:3 Shalini:3 Dilani:3 Thushari:2 Nithya:3 Sangeetha:3 Yasodha:2') }, last: w('Perera:4 Fernando:4 Silva:3 Jayasinghe:2 Wickramasinghe:2 Rajaratnam:3 Sivalingam:3 Thavarajah:2 Selvarajah:3 Kanagaratnam:2 Pillai:3') },
      nepali: { w: 14, first: { M: w('Bikash:3 Sujan:3 Prakash:3 Ramesh:3 Binod:3 Roshan:3 Anil:3 Dipak:2 Suman:3 Nabin:3'), F: w('Sita:3 Anita:3 Sunita:3 Sabina:3 Rina:3 Pooja:3 Sarita:3 Kabita:3 Mina:3 Asmita:2') }, last: w('Gurung:5 Rai:4 Limbu:3 Thapa:4 Magar:4 Tamang:3 Shrestha:4 Sherpa:2 Adhikari:3 Karki:3 Gurung:2') },
      filipino: { w: 14, first: { M: w('Jose:4 Mark:3 John:3 Jerome:3 Arnel:2 Ramon:3 Carlo:3 Joel:3 Mario:2 Rey:3'), F: w('Maria:4 Joy:3 Grace:3 Maricel:3 Jocelyn:3 Rowena:3 Angelica:3 Rosalie:2 Jennifer:3 Cristina:3 Mary_Ann:2') }, last: w('Santos:4 Reyes:4 Cruz:4 Bautista:3 Garcia:3 Ramos:3 Mendoza:3 Flores:3 Aquino:2 Dela_Cruz:3 Villanueva:2 Castillo:2') },
      // South-East / East Asian: one naming tradition per sub. UK convention = given name first, family name last; family names are kept by women on marriage.
      // Weights: the old pooled sea_east weight (18) split by the country-of-birth weights above (Vietnam 8, Korea 6, Japan 4, Thailand 6, Malaysia 4, Indonesia 3).
      vietnamese: S(4.6, 'Minh:4 Hung:3 Duc:3 Tuan:3 Quang:3 Long:3 Nam:3 Khoa:2 Bao:2 Hieu:3 Thanh:3 Dung:3 Son:3', 'Linh:4 Hoa:3 Mai:4 Thao:3 Lan:3 Huong:3 Trang:3 Anh:3 Ngoc:3 Hanh:3 Thuy:3 Yen:2 Phuong:3 Nhung:2', 'Nguyen:38 Tran:11 Le:10 Pham:7 Hoang:5 Huynh:5 Phan:4 Vu:4 Dang:3 Bui:3 Do:3 Ngo:2 Duong:2 Ly:1'),
      korean: S(3.5, 'Min-jun:4 Seo-jun:3 Ji-hoon:4 Joon-ho:3 Hyun-woo:3 Sung-min:3 Tae-yang:2 Dong-hyun:3 Jae-won:3 Woo-jin:3 Young-ho:2', 'Ji-woo:3 Seo-yeon:4 Min-ji:4 Ha-eun:3 Soo-jin:3 Ji-hye:3 Eun-ji:3 Yu-na:3 Hye-jin:3 Da-eun:3 Hee-young:2', 'Kim:21 Lee:15 Park:8 Choi:5 Jung:4 Kang:3 Cho:3 Yoon:3 Jang:3 Lim:2 Han:2 Oh:2 Seo:2 Shin:2'),
      japanese: S(2.3, 'Hiroshi:3 Kenji:3 Takeshi:3 Daiki:3 Haruto:3 Ren:3 Sota:3 Takumi:3 Shota:3 Kenta:3 Yuki:2', 'Yuki:3 Mika:3 Sakura:3 Haruka:3 Aiko:3 Yui:3 Hana:3 Ayaka:3 Misaki:3 Naoko:3 Emi:3', 'Sato:5 Suzuki:5 Takahashi:4 Tanaka:4 Watanabe:4 Ito:3 Yamamoto:3 Nakamura:3 Kobayashi:3 Kato:3 Yoshida:3 Yamada:3'),
      thai: S(3.5, 'Somchai:3 Anan:3 Somsak:3 Prasert:3 Chaiwat:3 Nattapong:3 Kritsada:3 Thanakorn:3 Wichai:2 Pichai:3 Sarawut:3', 'Mali:3 Nok:3 Pranee:3 Suda:3 Kanya:3 Ploy:3 Siriporn:3 Nittaya:3 Kanokwan:3 Araya:3', 'Srisai:3 Wongsa:3 Saetang:3 Boonmee:3 Chaiyasit:3 Prasertsak:2 Sukhum:2 Thongchai:3 Jaidee:3 Rattanakorn:2 Srisuk:3'),
      malaysian: S(2.3, 'Ahmad:4 Muhammad:5 Rizal:3 Hafiz:3 Farid:3 Aiman:3 Danial:3 Amir:3 Hakim:3 Zulkifli:2', 'Siti:5 Nur:4 Nurul:4 Aisyah:3 Nadia:3 Aini:3 Farah:3 Fatimah:3 Sharifah:2', 'Abdullah:4 Ismail:4 Rahman:3 Hassan:3 Ibrahim:3 Hamid:3 Yusof:3 Aziz:3 Othman:3 Ahmad:3 Rashid:2'),
      indonesian: S(1.7, 'Budi:4 Agus:3 Joko:3 Eko:3 Dedi:3 Rizky:3 Andi:3 Bayu:3 Fajar:3', 'Siti:4 Dewi:4 Sri:3 Putri:3 Ayu:3 Rina:3 Sari:3 Wulan:3 Indah:3 Fitri:3', 'Wijaya:3 Santoso:3 Hidayat:3 Kusuma:3 Setiawan:3 Pratama:3 Saputra:3 Susanto:3 Wibowo:3 Gunawan:3 Nugroho:3'),
      // West/Central Asian: Afghan (Dari/Pashto), Iranian (Persian) and Iraqi Kurdish are separate traditions. Old pooled weight 30 split by birth weights Afghanistan 10, Iran 6, Iraq (Kurdish) 3.
      afghan: S(15.8, 'Ahmad:4 Mohammad:4 Farid:3 Hamid:3 Rahim:3 Ali:3 Najib:3 Jawad:3 Sayed:3 Nasir:3 Mustafa:3 Wahid:3 Qais:2 Omid:3', 'Fatima:3 Zarina:3 Mina:3 Maryam:4 Laila:3 Shabnam:3 Sima:3 Farzana:3 Nilofar:2 Parwana:3 Fawzia:2 Mariam:4 Khatera:2', 'Ahmadi:4 Noori:3 Rahimi:3 Karimi:3 Sadat:3 Hashimi:3 Popal:2 Safi:3 Stanikzai:2 Ghafari:3 Mohammadi:4 Rezaie:3 Qaderi:2 Yousufi:3 Ahmadzai:2'),
      iranian: S(9.5, 'Reza:4 Ali:4 Hossein:3 Kaveh:3 Sina:3 Arash:3 Pouya:3 Mehdi:3 Hamed:3 Babak:3 Farhad:3 Shahab:2 Amir:4 Behnam:3', 'Roya:3 Shirin:3 Maryam:4 Leila:3 Sara:3 Shadi:3 Parisa:3 Neda:3 Mina:3 Azadeh:3 Niloufar:3 Zahra:3 Nasrin:3', 'Hosseini:4 Mohammadi:4 Rezaei:4 Sadeghi:3 Karimi:3 Hashemi:3 Ahmadi:3 Moradi:3 Jafari:3 Mousavi:3 Ghorbani:2 Kazemi:3 Sharifi:3 Rostami:3'),
      kurdish: S(4.7, 'Azad:4 Hemin:3 Karwan:3 Dara:3 Baran:3 Rebwar:3 Shwan:3 Twana:3 Sherko:3 Kawa:3 Hevar:2 Ako:3', 'Narin:3 Hevi:3 Zhila:3 Shilan:3 Dilan:3 Rojan:3 Ronak:3 Sozan:3 Lana:3 Shnyar:2 Berivan:3 Zainab:3', 'Barzani:3 Talabani:3 Hamad:4 Mohammed:4 Ahmed:4 Rasul:3 Salih:3 Ali:3 Karim:3 Sabir:3 Hussein:3 Ibrahim:3 Faraj:2 Omer:3 Ismail:3'),
    },
  },
  african: {
    label: 'Black African (Nigerian, Ghanaian, Somali, Zimbabwean, Eritrean, Congolese, Sierra Leonean, Kenyan...)', birth: { uk: 0.38, other: [['Nigeria', 24], ['Ghana', 12], ['Somalia', 14], ['Zimbabwe', 7], ['Eritrea', 6], ['Sudan', 5], ['Democratic Republic of Congo', 5], ['Sierra Leone', 4], ['Kenya', 5], ['Uganda', 3], ['South Africa', 3], ['Cameroon', 3], ['Ethiopia', 5], ['Angola', 3], ['Zambia', 2]] },
    sub: {
      nigerian: { w: 24, first: { M: w('Emeka:3 Chukwuemeka:3 Oluwaseun:4 Tunde:3 Segun:3 Chidi:3 Ifeanyi:3 Kehinde:2 Femi:3 Tobi:4 David:3 Samuel:3 Daniel:3 Michael:3 Chinedu:3 Kelechi:2 Obinna:3'), F: w('Chioma:3 Adaeze:3 Funmi:3 Folake:3 Ngozi:3 Amaka:3 Bukola:3 Temitope:3 Blessing:4 Grace:3 Favour:3 Ifeoma:3 Nkechi:2 Yetunde:3 Esther:3 Ruth:3') }, last: w('Okafor:4 Adeyemi:4 Okonkwo:4 Balogun:3 Adebayo:4 Ogunleye:3 Eze:3 Nwosu:3 Olawale:3 Abiodun:2 Ibrahim:2 Mensah:0 Chukwu:3 Obi:3 Ojo:3 Adeleke:3 Akinyemi:3') },
      ghanaian: { w: 12, first: { M: w('Kwame:3 Kofi:3 Kwesi:3 Yaw:3 Kwabena:3 Nana:3 Emmanuel:4 Samuel:3 Isaac:3 Kojo:3 Prince:2 Daniel:3'), F: w('Ama:3 Akosua:3 Abena:3 Efua:3 Adwoa:3 Esi:3 Grace:3 Gifty:3 Comfort:3 Mavis:3 Patience:3 Abigail:3') }, last: w('Mensah:5 Owusu:4 Asante:4 Boateng:4 Osei:4 Appiah:3 Agyeman:3 Addo:3 Ofori:3 Danso:3 Amoah:3 Quaye:2 Tetteh:2') },
      somali: { w: 14, first: { M: w('Abdi:4 Mohamed:5 Ahmed:4 Abdullahi:4 Hassan:4 Ali:4 Yusuf:4 Ismail:3 Mahad:3 Liban:3 Warsame:2 Abdirahman:3 Farah:3 Omar:4'), F: w('Fatuma:4 Hodan:4 Ifrah:4 Amina:4 Maryan:4 Ayan:3 Sagal:3 Hawa:3 Khadra:3 Nimco:3 Safiya:3 Sahra:3 Ubah:2 Zamzam:3') }, last: w('Abdi:5 Mohamud:4 Hassan:4 Ali:4 Ahmed:4 Warsame:3 Omar:4 Ibrahim:3 Farah:3 Yusuf:3 Jama:3 Egal:2 Osman:3 Nur:3 Hirsi:2 Dahir:2 Isse:2') , conv: 'patronymic' },
      // Split of the old pooled `horn_central_southern` (weight 50) by the birth-country weights above: Horn = Eritrea 6 + Ethiopia 5; East = Kenya 5, Uganda 3;
      // Southern = Zimbabwe 7, Zambia 2, South Africa 3; Central/West = DRC 5, Sierra Leone 4, Cameroon 3, Angola 3; Sudan 5. Each draw keeps names and birthplace in one tradition.
      // Horn: PATRONYMIC. The "surname" is the father's given name (Eritrean/Ethiopian and, in the UK, Somali usage); children take their father's given name.
      horn: S(11, 'Tesfay:4 Dawit:4 Yonas:4 Mulugeta:3 Henok:3 Samson:2 Biniam:3 Filmon:3 Meles:2 Yohannes:3 Michael:3 Daniel:4 Samuel:3 Abel:3 Robel:3 Eyob:2 Natnael:3 Mussie:2 Awet:3 Haben:3 Amanuel:3 Berhane:2 Solomon:3 Tewodros:2', 'Selam:4 Hanna:4 Meron:4 Tsion:3 Helen:3 Rahel:4 Saba:3 Mebrat:2 Lidia:3 Sara:3 Eden:3 Semhar:3 Bethlehem:2 Kidist:3 Mahlet:3 Hiwot:3 Yordanos:2 Tigist:3 Rediet:3 Senait:3 Meaza:2 Aster:3', 'Tesfay:3 Haile:4 Berhane:3 Kidane:3 Tekle:3 Mehari:2 Woldu:2 Mulugeta:2 Abraham:3 Yohannes:3 Michael:3 Tewolde:2 Solomon:3 Kahsay:2 Fitsum:2 Zerai:2 Negash:2 Bahta:2 Daniel:2 Tsegay:3 Habtom:3 Ghirmay:2 Hagos:3 Asmerom:2 Abebe:3 Bekele:3 Alemu:3 Girma:3 Tadesse:3 Desta:3 Getachew:2 Tilahun:2 Assefa:3', { conv: 'patronymic' }),
      kenyan: S(5, 'Brian:4 Kevin:4 Dennis:3 Collins:3 Moses:3 Peter:3 Joseph:3 John:3 James:3 Patrick:3 Samuel:3 David:3 Felix:2 Allan:2 Geoffrey:3 Isaac:3 Hillary:2', 'Faith:4 Mercy:4 Joy:3 Grace:4 Beatrice:3 Esther:3 Mary:3 Winnie:3 Sharon:3 Lucy:3 Irene:3 Caroline:3 Jackline:2 Ruth:3 Susan:2 Jane:3', 'Kamau:4 Otieno:4 Mwangi:4 Njoroge:3 Odhiambo:3 Omondi:3 Kariuki:3 Wekesa:3 Kiplagat:2 Mutua:3 Ochieng:3 Wanyama:2 Kimani:3 Macharia:2'),
      ugandan: S(3, 'Brian:3 Moses:3 Joseph:3 Isaac:3 Ronald:3 Joel:3 Ivan:3 Emmanuel:3 Richard:3 Samuel:3 Denis:3', 'Grace:3 Sarah:3 Juliet:3 Joan:3 Winnie:3 Annet:3 Prossy:2 Esther:3 Rebecca:3 Patience:3 Ruth:3', 'Mukasa:4 Okello:3 Kato:3 Tumusiime:3 Ssekandi:2 Byaruhanga:2 Ochieng:2 Kiwanuka:3 Opio:3 Mugisha:3 Ssebunya:2 Lubega:3 Atwine:2'),
      zimbabwean: S(7, 'Tendai:4 Tafara:3 Tatenda:3 Farai:3 Tinashe:3 Takudzwa:2 Blessing:3 Kudzai:3 Simbarashe:3 Tapiwa:3 Nyasha:3 Brighton:3 Lovemore:3 Munyaradzi:2 Prince:2 Thabo:2 Sipho:2', 'Rudo:3 Chipo:3 Tendai:3 Nyasha:3 Rutendo:3 Tsitsi:3 Memory:3 Precious:3 Tariro:3 Vimbai:3 Ruvimbo:2 Fadzai:3 Shamiso:2 Tadiwa:2 Sithembile:2', 'Moyo:5 Ncube:4 Dube:4 Sibanda:4 Ndlovu:3 Chikwanha:2 Mutasa:3 Chigumba:2 Mudzingwa:2 Mhlanga:3 Nyoni:3 Mpofu:3 Makoni:3 Chidziva:2'),
      zambian_malawian: S(2, 'Chanda:3 Mwamba:3 Kennedy:3 Chisomo:3 Joseph:3 Peter:3 Mathews:2 Isaac:3 Francis:3 Wilson:3', 'Chanda:3 Mwila:3 Mutinta:3 Esther:3 Chisomo:3 Grace:3 Mercy:3 Natasha:2 Thandiwe:3 Bwalya:2', 'Banda:5 Phiri:4 Mwale:3 Tembo:3 Zulu:3 Lungu:3 Mulenga:3 Mumba:3 Chanda:3 Sakala:2 Daka:2 Mwansa:3'),
      south_african: S(3, 'Sipho:3 Thabo:3 Bongani:3 Themba:3 Lungile:2 Mandla:3 Siyabonga:2 Tshepo:3 Kagiso:3 Lerato:2 Neo:2 Mpho:3', 'Thandiwe:3 Nomvula:3 Zanele:3 Lindiwe:3 Nokuthula:2 Lerato:3 Palesa:3 Naledi:3 Ayanda:3 Busisiwe:3 Thandeka:3', 'Nkosi:4 Dlamini:4 Ndlovu:3 Mokoena:3 Khumalo:3 Zulu:3 Mahlangu:3 Sithole:3 Ngcobo:3 Molefe:3 Mthembu:3 Radebe:3'),
      congolese: S(5, 'Jean:4 Pierre:3 Patrick:3 Jonathan:3 Placide:2 Christian:3 Blaise:3 Fiston:2 Emmanuel:4 Héritier:2 Trésor:3 Dieudonné:2 Joël:3 Merveille:2', 'Marie:4 Esther:3 Grace:4 Christelle:3 Mireille:3 Nadège:3 Pascaline:2 Divine:3 Bénédicte:3 Josiane:2 Chantal:3 Merveille:2', 'Mbala:3 Mukendi:3 Kabongo:3 Ilunga:3 Kalala:3 Mutombo:3 Mbuyi:3 Kasongo:3 Lukusa:2 Ngandu:2 Mulumba:3 Kabila:2 Tshibangu:3 Kasa:2'),
      sierra_leonean: S(4, 'Alusine:3 Sheku:3 Mohamed:4 Ibrahim:3 Abdul:3 Foday:3 Sorie:2 Alpha:3 Santigie:2 Abu:3 Joseph:3 Emmanuel:3 Samuel:3 Patrick:3', 'Aminata:4 Fatmata:4 Mariatu:3 Isatu:3 Hawa:3 Kadiatu:3 Adama:2 Marie:3 Mabinty:3 Fatu:3 Jenneh:2', 'Kamara:5 Sesay:4 Bangura:4 Koroma:4 Conteh:3 Turay:3 Jalloh:3 Bah:3 Sankoh:2 Kanu:3 Mansaray:3 Cole:2 Macauley:2 Coker:2'),
      cameroonian: S(3, 'Jean:3 Patrick:3 Emmanuel:3 Fabrice:3 Serge:3 Armand:2 Blaise:2 Landry:2 Hervé:3 Brice:3 Alain:3', 'Marie:4 Nadine:3 Estelle:3 Carine:3 Sandrine:3 Aurélie:3 Florence:3 Brenda:3 Larissa:3 Vanessa:3', 'Tchoumi:3 Fotso:3 Nkeng:3 Mbarga:3 Ndongo:3 Atangana:3 Tchinda:3 Kamga:3 Biya:2 Mbella:3 Ngu:3 Tabe:3'),
      angolan: S(3, 'João:4 Pedro:3 Manuel:4 António:4 Miguel:3 Domingos:3 Fernando:3 Paulo:4 Francisco:3 Mário:3', 'Maria:5 Ana:4 Joana:3 Luzia:3 Teresa:3 Isabel:3 Domingas:2 Esperança:2 Madalena:3 Catarina:3', 'Silva:5 Santos:4 Neto:3 Domingos:3 Baptista:3 Fernandes:4 Pereira:3 Gomes:3 Manuel:2 Cardoso:3 Sebastião:2 Lopes:3'),
      sudanese: S(5, 'Mohamed:5 Ahmed:4 Abdalla:3 Ibrahim:4 Omer:3 Hassan:3 Osman:3 Khalid:3 Mustafa:3 Yousif:3 Ali:3 Hamza:3 Elfatih:2 Mahmoud:3 Tariq:3', 'Fatima:4 Amna:3 Hanan:3 Rawan:3 Mariam:3 Zainab:3 Nada:3 Amira:3 Sara:3 Samah:3 Rania:3 Ihsan:2', 'Osman:4 Elamin:3 Idris:3 Babiker:3 Abdelrahman:3 Hamid:3 Ibrahim:3 Mohamed:3 Ahmed:3 Adam:3 Suleiman:3 Elhassan:3 Abdalla:3 Eltayeb:2 Mahgoub:2 Khalifa:2'),
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
      // Arab world split into the four naming/dialect regions that differ in surnames (the old single pool mixed them). Weights from the birth-country list above
      // (Gulf/Iraq: Iraq 10, Yemen 4, Kuwait 2, Saudi 1; Levant: Syria 9, Lebanon 4, Palestine/Jordan 1; Maghreb: Libya 4, Morocco 4, Algeria 3, Tunisia 1; Egypt 5). Women keep their own family name.
      gulf_iraq: S(17, 'Mohammed:5 Ahmed:4 Ali:5 Hussein:4 Hassan:4 Mustafa:3 Abbas:3 Haider:3 Zaid:3 Salman:3 Yousif:3 Ammar:3 Mohanad:2 Abdullah:4 Saif:2', 'Zainab:4 Fatima:4 Noor:4 Zahra:3 Mariam:3 Rand:3 Sarah:3 Hawraa:3 Shahad:3 Aya:3 Duaa:2 Amal:3', 'Al-Hassan:3 Al-Sayed:3 Al-Jubouri:3 Al-Tamimi:3 Al-Hashimi:3 Al-Saadi:3 Al-Obaidi:3 Al-Rubaie:2 Al-Khafaji:2 Al-Ani:3 Hussein:4 Abdullah:4 Al-Zubaidi:2 Al-Hakimi:3 Al-Qahtani:2'),
      levant: S(14, 'Ahmad:4 Mohammad:5 Omar:3 Khaled:3 Samer:3 Fadi:3 Rami:3 Tarek:3 Bassel:3 Majd:2 Wael:3 Elias:3 Georges:3 Nabil:3', 'Rana:3 Dina:3 Hiba:3 Rima:3 Lina:4 Nour:4 Hala:3 Rasha:3 Maya:3 Sawsan:2 Zeina:3 Rola:3', 'Haddad:4 Khalil:3 Mansour:3 Nasser:3 Darwish:3 Khoury:3 Saleh:3 Abboud:3 Hamdan:3 Issa:3 Atallah:2 Sabbagh:2 Barakat:2 Al-Hariri:3 Al-Ahmad:3 Shami:2 Khatib:3'),
      maghrebi: S(12, 'Mohamed:5 Youssef:4 Karim:3 Samir:3 Rachid:3 Mehdi:3 Hamza:3 Amine:3 Walid:3 Nabil:3 Khalid:3 Omar:3 Sofiane:3 Yassine:3 Bilal:3 Hicham:2', 'Fatima:4 Samira:3 Amina:3 Nadia:3 Yasmine:4 Salma:3 Leila:3 Imane:3 Meriem:3 Khadija:3 Sara:3 Hanane:2', 'Benali:3 Bouzid:3 Mansouri:3 Benhamou:2 Belkacem:3 Hamdi:3 El_Amrani:3 Benkirane:2 Saidi:3 Ben_Youssef:2 Boukhari:2 Larbi:3 Khelifi:3 Chaoui:2 Tahiri:3 Bouazza:2 Al-Mahdi:2 Elmagrabi:2 Ghariani:2 Elshareef:2'),
      egyptian: S(5, 'Mohamed:5 Ahmed:5 Mahmoud:4 Mostafa:4 Omar:3 Karim:3 Tarek:3 Hossam:3 Amr:3 Ayman:3 Hany:3 Sherif:3 Ibrahim:3 Youssef:4 Khaled:3 Mina:1', 'Fatma:4 Mona:3 Heba:3 Noha:3 Dina:3 Nour:3 Aya:3 Sara:3 Mariam:4 Hala:3 Rania:3 Eman:3', 'Hassan:4 Ibrahim:4 Mahmoud:4 Abdelrahman:3 Mostafa:3 El-Sayed:4 Soliman:3 Farouk:3 Salah:3 Youssef:3 Ghaly:2 Girgis:2 Boules:1 Guirguis:2 Fouad:2'),
      turkish: S(17, 'Mehmet:4 Mustafa:4 Emre:3 Murat:3 Ahmet:3 Burak:3 Can:3 Cem:3 Hasan:3 Serkan:2 Ali:3 Hakan:3', 'Ayşe:4 Fatma:4 Elif:4 Zeynep:4 Esra:3 Merve:3 Selin:3 Derya:2 Emine:3 Hatice:3 Gül:3 Nur:3', 'Yılmaz:5 Kaya:4 Demir:4 Şahin:4 Çelik:4 Öztürk:3 Aydın:3 Arslan:3 Doğan:3 Kılıç:3 Yıldız:3 Aksoy:3'),
      // Latin America: Brazil is Portuguese-speaking (own given names and surnames); the rest is Spanish-speaking. Old pooled weight 30 split by Brazil 8 : (Colombia 7, Ecuador 3, Peru 3, Venezuela 3, Bolivia 1, Mexico 1) = 8:18 -> 9:21.
      // Spanish-speaking people formally carry two surnames; the sim keeps the paternal one only (UK records usually register one).
      brazilian: S(9, 'Lucas:4 Gabriel:4 Rafael:3 Matheus:4 Gustavo:3 Felipe:3 Bruno:3 Thiago:3 Rodrigo:3 Leandro:3 Diego:3 Vinicius:3 Pedro:3 João:3 Carlos:3', 'Ana:4 Camila:4 Juliana:4 Fernanda:4 Mariana:3 Beatriz:3 Larissa:3 Gabriela:3 Amanda:3 Bruna:3 Letícia:3 Aline:3 Patrícia:3 Renata:3', 'Silva:6 Santos:5 Oliveira:5 Souza:5 Costa:4 Pereira:4 Rodrigues:4 Almeida:3 Lima:3 Ferreira:3 Carvalho:3 Gomes:3 Ribeiro:3 Martins:3 Barbosa:3'),
      spanish_latam: S(21, 'Carlos:4 Juan:4 Luis:4 Andrés:3 Santiago:3 Mateo:3 Diego:3 Felipe:3 Camilo:3 Jhon:2 Wilmer:2 Jairo:3 Edwin:3 Cristian:3 Sebastián:3 Alejandro:3 Jorge:3', 'María:4 Camila:4 Valentina:4 Daniela:3 Natalia:3 Andrea:3 Gabriela:3 Carolina:3 Juliana:3 Sofía:4 Luz:3 Paola:3 Diana:3 Yesenia:2 Katherine:3', 'Gómez:4 Rodríguez:4 Martínez:4 López:3 Hernández:3 Pérez:3 Ramírez:3 Torres:3 Díaz:3 Morales:3 Vargas:3 Castro:3 Rojas:3 Mendoza:3 Quispe:2 Herrera:3'),
    },
  },
};
// Birth countries consistent with a name sub-origin (used instead of the group-level birth list when the group has sub-origins).
export const SUB_BIRTH = {
  polish: [['Poland', 1]], romanian: [['Romania', 1]], italian: [['Italy', 1]], irish: [['Ireland', 1]],
  portuguese: [['Portugal', 1]], spanish: [['Spain', 1]], lithuanian: [['Lithuania', 1]], latvian: [['Latvia', 1]],
  bulgarian: [['Bulgaria', 1]], czech_slovak: [['Slovakia', 3], ['Czechia', 2]], hungarian: [['Hungary', 1]], albanian: [['Albania', 5], ['Kosovo', 2]], greek: [['Greece', 4], ['Cyprus', 3]],
  russian: [['Russia', 4], ['Belarus', 1]], ukrainian: [['Ukraine', 1]],
  german: [['Germany', 5], ['Austria', 1]], dutch_flemish: [['Netherlands', 3], ['Belgium', 1]], nordic: [['Sweden', 3], ['Denmark', 2], ['Norway', 2]], french: [['France', 5], ['Belgium', 1]],
  anglosphere: [['USA', 4], ['Australia', 2], ['Canada', 2], ['New Zealand', 1], ['South Africa', 1]],
  punjabi_sikh: [['India', 8], ['Kenya', 1], ['Uganda', 1]], gujarati: [['India', 6], ['Kenya', 3], ['Uganda', 2], ['Tanzania', 2]], other_indian: [['India', 9], ['UAE', 1], ['Singapore', 1]],
  tamil_sinhala: [['Sri Lanka', 1]], nepali: [['Nepal', 1]], filipino: [['Philippines', 1]],
  vietnamese: [['Vietnam', 1]], korean: [['South Korea', 1]], japanese: [['Japan', 1]], thai: [['Thailand', 1]], malaysian: [['Malaysia', 1]], indonesian: [['Indonesia', 1]],
  afghan: [['Afghanistan', 1]], iranian: [['Iran', 1]], kurdish: [['Iraq', 4], ['Iran', 1], ['Syria', 1]],
  mainland_chinese: [['China', 15], ['Taiwan', 1]], cantonese_hk: [['Hong Kong', 23], ['Malaysia', 7], ['Singapore', 3], ['Vietnam', 3]],
  nigerian: [['Nigeria', 1]], ghanaian: [['Ghana', 1]], somali: [['Somalia', 3], ['Kenya', 1], ['Ethiopia', 1]],
  horn: [['Eritrea', 6], ['Ethiopia', 5]], kenyan: [['Kenya', 1]], ugandan: [['Uganda', 1]], zimbabwean: [['Zimbabwe', 1]], zambian_malawian: [['Zambia', 3], ['Malawi', 1]], south_african: [['South Africa', 1]],
  congolese: [['Democratic Republic of Congo', 1]], sierra_leonean: [['Sierra Leone', 1]], cameroonian: [['Cameroon', 1]], angolan: [['Angola', 1]], sudanese: [['Sudan', 1]],
  gulf_iraq: [['Iraq', 10], ['Yemen', 4], ['Kuwait', 2], ['Saudi Arabia', 1]], levant: [['Syria', 9], ['Lebanon', 4], ['Palestine', 1], ['Jordan', 1]], maghrebi: [['Libya', 4], ['Morocco', 4], ['Algeria', 3], ['Tunisia', 1]], egyptian: [['Egypt', 1]],
  turkish: [['Turkey', 4], ['Cyprus', 1]], brazilian: [['Brazil', 1]], spanish_latam: [['Colombia', 7], ['Ecuador', 3], ['Peru', 3], ['Venezuela', 3], ['Bolivia', 1], ['Mexico', 1]],
};
// Religion for sub-origins where it differs sharply from the group prior (overrides RELIGION_BY_GROUP[group] when present).
export const RELIGION_BY_SUB = {
  punjabi_sikh: { Sikh: 0.85, Hindu: 0.07, 'No religion': 0.03, Christian: 0.02, Muslim: 0.0, Other: 0.03 },
  gujarati: { Hindu: 0.78, Muslim: 0.12, Christian: 0.03, 'No religion': 0.04, Other: 0.03 },
  other_indian: { Hindu: 0.45, Muslim: 0.15, Christian: 0.15, 'No religion': 0.08, Sikh: 0.08, Buddhist: 0.02, Other: 0.07 },
  tamil_sinhala: { Hindu: 0.45, Buddhist: 0.3, Christian: 0.12, Muslim: 0.08, 'No religion': 0.04, Other: 0.01 },
  nepali: { Hindu: 0.5, Buddhist: 0.3, Christian: 0.1, 'No religion': 0.08, Other: 0.02 },
  filipino: { Christian: 0.92, 'No religion': 0.05, Muslim: 0.02, Other: 0.01 },
  nigerian: { Christian: 0.7, Muslim: 0.25, 'No religion': 0.03, Other: 0.02 }, ghanaian: { Christian: 0.88, Muslim: 0.08, 'No religion': 0.03, Other: 0.01 }, somali: { Muslim: 0.99, Other: 0.01 },
  polish: { Christian: 0.8, 'No religion': 0.18, Other: 0.02 }, romanian: { Christian: 0.85, 'No religion': 0.12, Other: 0.03 }, italian: { Christian: 0.65, 'No religion': 0.33, Other: 0.02 },
  // new sub-origins (priors from ONS Census 2021 religion by country of birth / ethnic group, rounded; migrants skew Christian from the Horn, Muslim from Maghreb/Levant/Gulf)
  vietnamese: { Buddhist: 0.45, 'No religion': 0.3, Christian: 0.22, Other: 0.03 }, korean: { Christian: 0.4, 'No religion': 0.45, Buddhist: 0.13, Other: 0.02 }, japanese: { 'No religion': 0.6, Buddhist: 0.25, Christian: 0.13, Other: 0.02 },
  thai: { Buddhist: 0.8, 'No religion': 0.1, Christian: 0.05, Muslim: 0.05 }, malaysian: { Muslim: 0.92, Christian: 0.04, 'No religion': 0.03, Other: 0.01 }, indonesian: { Muslim: 0.85, Christian: 0.1, 'No religion': 0.04, Other: 0.01 },
  afghan: { Muslim: 0.95, 'No religion': 0.03, Christian: 0.01, Other: 0.01 }, iranian: { Muslim: 0.6, 'No religion': 0.2, Christian: 0.15, Other: 0.05 }, kurdish: { Muslim: 0.9, 'No religion': 0.07, Christian: 0.01, Other: 0.02 },
  horn: { Christian: 0.72, Muslim: 0.2, 'No religion': 0.06, Other: 0.02 }, kenyan: { Christian: 0.8, Muslim: 0.12, 'No religion': 0.06, Other: 0.02 }, ugandan: { Christian: 0.86, Muslim: 0.1, 'No religion': 0.03, Other: 0.01 },
  zimbabwean: { Christian: 0.86, 'No religion': 0.1, Muslim: 0.02, Other: 0.02 }, zambian_malawian: { Christian: 0.88, Muslim: 0.05, 'No religion': 0.05, Other: 0.02 }, south_african: { Christian: 0.82, 'No religion': 0.12, Muslim: 0.02, Other: 0.04 },
  congolese: { Christian: 0.9, 'No religion': 0.06, Muslim: 0.02, Other: 0.02 }, sierra_leonean: { Muslim: 0.5, Christian: 0.47, 'No religion': 0.02, Other: 0.01 }, cameroonian: { Christian: 0.85, Muslim: 0.08, 'No religion': 0.05, Other: 0.02 },
  angolan: { Christian: 0.9, 'No religion': 0.07, Other: 0.03 }, sudanese: { Muslim: 0.92, Christian: 0.05, 'No religion': 0.02, Other: 0.01 },
  gulf_iraq: { Muslim: 0.92, 'No religion': 0.04, Christian: 0.03, Other: 0.01 }, levant: { Muslim: 0.78, Christian: 0.15, 'No religion': 0.06, Other: 0.01 }, maghrebi: { Muslim: 0.93, 'No religion': 0.05, Christian: 0.01, Other: 0.01 }, egyptian: { Muslim: 0.83, Christian: 0.14, 'No religion': 0.02, Other: 0.01 },
  turkish: { Muslim: 0.85, 'No religion': 0.1, Christian: 0.03, Other: 0.02 }, brazilian: { Christian: 0.78, 'No religion': 0.18, Other: 0.04 }, spanish_latam: { Christian: 0.75, 'No religion': 0.2, Muslim: 0.01, Other: 0.04 },
  portuguese: { Christian: 0.7, 'No religion': 0.27, Other: 0.03 }, spanish: { Christian: 0.55, 'No religion': 0.42, Other: 0.03 },
  lithuanian: { Christian: 0.8, 'No religion': 0.18, Other: 0.02 }, latvian: { Christian: 0.6, 'No religion': 0.37, Other: 0.03 }, bulgarian: { Christian: 0.78, Muslim: 0.1, 'No religion': 0.11, Other: 0.01 }, czech_slovak: { Christian: 0.5, 'No religion': 0.48, Other: 0.02 },
  hungarian: { Christian: 0.6, 'No religion': 0.37, Other: 0.03 }, albanian: { Muslim: 0.55, Christian: 0.35, 'No religion': 0.09, Other: 0.01 }, greek: { Christian: 0.88, 'No religion': 0.1, Other: 0.02 }, russian: { Christian: 0.55, 'No religion': 0.38, Jewish: 0.03, Other: 0.04 }, ukrainian: { Christian: 0.72, 'No religion': 0.26, Other: 0.02 },
  german: { Christian: 0.45, 'No religion': 0.5, Other: 0.05 }, dutch_flemish: { Christian: 0.4, 'No religion': 0.55, Other: 0.05 }, nordic: { Christian: 0.35, 'No religion': 0.6, Other: 0.05 }, french: { Christian: 0.5, 'No religion': 0.42, Muslim: 0.04, Jewish: 0.01, Other: 0.03 }, anglosphere: { Christian: 0.5, 'No religion': 0.42, Jewish: 0.02, Other: 0.06 },
};
export const ARAB_OTHER_ALIAS = 'other'; // 'arab_other' parent in a Mixed mix resolves to the Other group (sub drawn from its arab/turkish/latin subs)

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
const subOf = (g, key) => (g.sub ? g.sub[key] || g.sub[Object.keys(g.sub)[0]] : g);
const drawSub = (rng, src) => (src.sub ? pickW(rng, Object.entries(src.sub).map(([k, v]) => [k, v.w])) : null);
function resolveGroup(rng, groupKey) {
  if (groupKey === 'mixed') { const mix = GROUPS.mixed.mix; const [a, b] = (() => { const pick = pickW(rng, mix.map((m, i) => [i, m[2]])); return [mix[pick][0], mix[pick][1]]; })(); return [rng.chance(0.5) ? a : b, rng.chance(0.5) ? a : b]; }
  return [groupKey, groupKey];
}
/** Pick a person's origin from their ethnicity group key (ETHNICITY_TO_GROUP value): {group, sub, firstSub, bornUK, birthplace, firstGroup, lastGroup}.
 *  `sub` is the naming tradition the surname AND birthplace come from; `firstSub` is where the given name comes from (== sub, except for Mixed people whose two sides differ).
 *  Optional `like` = an existing origin/pop record {group, sub} (a parent or household head): the new origin then shares its tradition (same sub) instead of a fresh draw. */
export function pickOrigin(rng, groupKey, birthYear = 1990, like = null) {
  let [fg, lg] = resolveGroup(rng, groupKey);
  if (fg === 'arab_other') fg = 'other'; if (lg === 'arab_other') lg = 'other';
  const gg = GROUPS[groupKey];
  const eff = Math.min(0.98, gg.birth.uk + (birthYear >= 2005 ? 0.25 : birthYear >= 1995 ? 0.1 : 0)); // young people more often UK-born
  const bornUK = rng.chance(eff);
  const src = GROUPS[lg];
  let sub = drawSub(rng, src), firstSub = sub;
  if (like && like.sub && src.sub && src.sub[like.sub] && fg === lg) { sub = firstSub = like.sub; }
  else if (fg !== lg) firstSub = drawSub(rng, GROUPS[fg]);
  const bp = bornUK ? 'United Kingdom' : pickW(rng, (sub && SUB_BIRTH[sub]) || gg.birth.other);
  return { group: groupKey, sub, firstSub, bornUK, birthplace: bp, firstGroup: fg, lastGroup: lg };
}
/** Origin for a baby born in the sim to `parents` (array of {group|eth|ethGroup, sub} records, e.g. ext.pop): one parent's tradition (the father's, 65%), never a fresh random one.
 *  Falls back to pickOrigin if no parent has a usable sub. Always UK-born. */
export function childOrigin(rng, groupKey, birthYear, parents = []) {
  const ps = parents.filter((p) => p && p.sub);
  const pick = ps.length ? (ps.length > 1 && !rng.chance(0.65) ? ps[1] : ps[0]) : null;
  const o = pickOrigin(rng, groupKey, birthYear, pick);
  if (pick && groupKey === 'mixed') { const g = pick.ethGroup || pick.group; if (GROUPS[g] && GROUPS[g].sub && GROUPS[g].sub[pick.sub]) { o.firstGroup = o.lastGroup = g; o.sub = o.firstSub = pick.sub; } }
  o.bornUK = true; o.birthplace = 'United Kingdom';
  return o;
}
/** Pick {first, last, full} for an origin + sex ('M'|'F') + birthYear. Names are drawn from the origin's single naming tradition. */
export function pickName(rng, origin, sex, birthYear = 1990) {
  const first = pickFirst(rng, origin, sex, birthYear); const last = pickSurname(rng, origin, sex);
  return { first, last, full: `${first} ${last}` };
}
export function pickFirst(rng, origin, sex, birthYear = 1990) {
  const g = GROUPS[origin.firstGroup] || GROUPS[origin.group]; const src = subOf(g, origin.firstSub || origin.sub);
  return fixup(surfaceName(pickW(rng, firstFrom(src, sex, cohortOf(birthYear)))));
}
const femForm = (rng, src, l, sex, kid = false) => { if (sex !== 'F' || !src.fem || typeof src.fem !== 'object') return l; const f = src.fem[l]; return Array.isArray(f) ? f[kid ? 1 : rng.chance(0.5) ? 0 : 1] : f || l; }; // Lithuanian daughters take -aitė (unmarried form)
export function pickSurname(rng, origin, sex) {
  const g = GROUPS[origin.lastGroup] || GROUPS[origin.group]; const src = subOf(g, origin.sub);
  let l = pickW(rng, src.last.filter(([, k]) => k > 0)); l = fixup(surfaceName(l));
  if (src.fem === 'kaur' && sex === 'F') return 'Kaur'; if (src.fem === 'begum' && sex === 'F' && rng.chance(0.55)) return 'Begum';
  return femForm(rng, src, l, sex);
}
/** Surname for a baby born in the sim. father/mother = {first, last} (as stored: firstName/lastName) or null; `useFather` = the caller's existing father-vs-mother choice.
 *  Convention per sub-origin: patronymic traditions (Horn of Africa, Somali) -> the FATHER'S GIVEN NAME (mother's surname if no father known); Slavic/Baltic/Greek/Polish -> the
 *  father's family name in the child's own gendered form; everyone else -> the chosen parent's surname unchanged. */
export function childSurname(rng, origin, sex, father, mother, useFather = true) {
  const g = GROUPS[origin.lastGroup] || GROUPS[origin.group]; const src = subOf(g, origin.sub);
  if (src.conv === 'patronymic') return father ? father.first : mother ? mother.last : pickSurname(rng, origin, sex);
  const from = (useFather && father) || mother || father; if (!from) return pickSurname(rng, origin, sex);
  let l = from.last;
  if (src.fem && typeof src.fem === 'object' && !(src.fem === 'kaur' || src.fem === 'begum')) { // recover the masculine base form, then re-inflect for the child
    const base = Object.keys(src.fem).find((k) => [].concat(src.fem[k]).includes(l)) || l; l = femForm(rng, src, base, sex, true);
  }
  return l;
}
export default { GROUPS, SUB_BIRTH, RELIGION_BY_SUB, RELIGION_BY_GROUP, ETHNICITY_TO_GROUP, pickOrigin, childOrigin, pickName, pickFirst, pickSurname, childSurname };
