"""Render the current user guide from the published revision and law manifest."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json, re
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

root=Path(__file__).resolve().parent.parent
today=datetime.now(ZoneInfo('Europe/Bucharest')).date().isoformat()
today_label=datetime.fromisoformat(today).strftime('%d.%m.%Y')
revision=int(re.search(r'^## Revizia (\d+)',(root/'README.md').read_text(),re.M)[1])
pdfmetrics.registerFont(TTFont('Inter',str(root/'public/fonts/Inter-Regular.ttf')))
pdfmetrics.registerFont(TTFont('InterSemi',str(root/'public/fonts/Inter-Semibold.ttf')))
pdfmetrics.registerFontFamily('Inter',normal='Inter',bold='InterSemi')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Text',fontName='Inter',fontSize=10.5,leading=17,textColor=colors.HexColor('#243247'),spaceAfter=10))
styles.add(ParagraphStyle(name='TitleA',fontName='InterSemi',fontSize=27,leading=34,textColor=colors.HexColor('#172338'),spaceAfter=20))
styles.add(ParagraphStyle(name='HeadingA',fontName='InterSemi',fontSize=15,leading=22,textColor=colors.HexColor('#0066cc'),spaceBefore=13,spaceAfter=10))
styles.add(ParagraphStyle(name='SmallA',fontName='Inter',fontSize=8.5,leading=13,textColor=colors.HexColor('#526077')))
out=root/f'public/downloads/Aflivra_v{revision}_Documentatie.pdf'
story=[]
def p(text,style='Text'):story.append(Paragraph(text,styles[style]))
def heading(text):p(text,'HeadingA')
def page(title):
    if story:story.append(PageBreak())
    p(title,'TitleA')
def footer(canvas,doc):
    canvas.setStrokeColor(colors.HexColor('#d8e2ef'));canvas.line(42,44,553,44)
    canvas.setFont('Inter',8);canvas.setFillColor(colors.HexColor('#526077'))
    canvas.drawString(42,29,f'Aflivra | Ghidul versiunii {revision} | {today_label}')
    canvas.drawRightString(553,29,str(doc.page))

page(f'Aflivra<br/>Ghidul versiunii {revision}')
p('România la îndemână. Date publice, vreme locală, explorare, transport și documente legislative într-o singură aplicație.')
p('Acest ghid este publicat la /downloads/ și expus în aplicație în secțiunea „Ghidurile platformei”, alături de ghidurile reviziilor anterioare. Codul și datele publicate sunt în depozitul Aflivra.')
heading('Locația și datele locale')
p('Deschide preferințele din butonul „Pentru tine”. Alege o localitate din listă și apasă „Aplică localitatea” sau folosește „Folosește locația mea”. Localitatea aplicată schimbă vremea și contextul categoriilor. Introducerea textului în căutare nu aplică o localitate nouă înainte de selectare.')
p('În lipsa unei locații salvate ori a accesului la locația dispozitivului, contextul este România. Pentru informațiile care cer un oraș, valoarea implicită este București. Schimbarea locației reîncarcă automat rezultatele locale și elimină selecțiile din orașul anterior. Informațiile naționale rămân etichetate ca naționale.')
heading('Explorare și Dashboard')
p('Categoriile din Dashboard folosesc aceeași colecție de coperți ca pagina principală. Vremea are propria ilustrație. În explorare poți vedea locurile cu galerii și poți căuta în inventarul național. Fotografiile reale păstrează proveniența și licența.')
heading('Dialoguri și filme')
p('Deschide detaliile din card și revino folosind butonul de închidere. La filme, trailerul pornește numai după apăsare. Dacă operatorul video nu permite redarea în pagină, folosește legătura către trailerul original.')

page('Date pentru localitatea ta')
heading('Locuri, vreme și cinematografe')
p('Locurile, serviciile și galeriile sunt afișate implicit în raza de 15 km. Poți schimba raza sau alege „Toată România”. Cinematografele sunt din localitatea activă ori din raza de 15 km. Prognoza folosește coordonatele curente; stațiile ANM sunt din raza de 50 km.')
p('Avertizările locale includ mesaje cu localitatea sau județul identificabil. Dacă zona nu poate fi recunoscută, consultă documentul național. Lipsa unei potriviri automate nu confirmă absența unui fenomen periculos.')
heading('Registre și instituții')
p('Școlile sunt filtrate după localitate și județ. Registrele CNAS indică județul casei contractante, fără să confirme adresa punctului de lucru. Avocații și căutările de dosare după nume ori obiect urmează zona activă. Căutarea după un număr precis urmărește implicit toate instanțele, inclusiv fondul, apelul și recursul.')
heading('Transport și spectacole')
p('Rețeaua, orarele și fluxurile TPBI acoperă București-Ilfov. În Cluj și alte zone apar stațiile și serviciile locale cartografiate, fără orare inventate. Calendarul Odeon este disponibil numai în zona sa. Când nu avem o sursă conectată pentru localitatea aleasă, aplicația explică lipsa acoperirii.')
heading('Seturi de date și grafice')
p('Catalogul include date locale, județene și naționale relevante. Tabelele cu coloane geografice sunt filtrate înainte de paginare și de grafic. Tabelele fără aceste coloane sunt etichetate ca naționale. „Toată România” permite consultarea explicită a altor zone. Legislația, literatura, cursurile și căutarea unei firme după CUI au acoperire națională.')

page('Dosare și ședințe publice')
heading('Urmărește dosarul la toate instanțele')
p('În Justiție, deschide căutarea de dosare și introdu numărul complet. Modul implicit „Toate instanțele și stadiile” urmărește numărul independent de locația dispozitivului. Criteriile de nume, obiect, instanță și interval sunt dezactivate pentru această căutare, ca să nu excludă alte fișe ale dosarului.')
p('Dacă dorești să restrângi intenționat căutarea, alege „În filtrele alese”. Căutările numai după nume ori obiect păstrează filtrele locale. Schimbarea locației reia căutarea și respinge răspunsurile întârziate.')
p('Căutarea aprofundată verifică succesiv ambele operații oficiale și reunește fișele. Răspunsurile goale, fără ședințe ori invalide primesc până la trei verificări în total. La HTTP 5xx sunt cel mult trei încercări pe operație; la 429 se respectă pauza sursei. Dacă verificarea suplimentară eșuează, fișele deja primite rămân disponibile, cu avertizarea aferentă.')
heading('Etape legate, fișe și confirmări apăsabile')
p('Parcursul dosarului grupează fondul, apelul și recursul confirmate. „Vezi fișa de fond/apel” deschide fișa cu toate ședințele și datele publicate. Mai multe fișe distincte ale aceleiași etape rămân separate. Numerele cu sufixe diferite nu sunt unite automat. Paginarea păstrează etapele aceluiași număr împreună.')
p('O trimitere oficială care identifică o sentință, instanța și dosarul poate confirma fondul fără fișa sa. „Vezi confirmarea” arată hotărârea, data, dosarul sursei și verificarea. „Deschide dosarul sursei” permite consultarea soluției originale. Confirmările descoperite sunt păstrate pentru căutări ulterioare, fără cereri suplimentare la portal. Exporturile PDF, CSV și Excel includ etapele și proveniența lor.')
heading('Exemplu: 6236/111/2017')
p('Fond: Tribunalul Bihor, sentința civilă 476/LM/2023 din 12.05.2023. Este confirmat prin soluția din 25.06.2026 a dosarului 2403/111/2025, preluată din serviciul oficial la 05.10.2026. Fișa fondului și toate ședințele sale nu sunt disponibile. Apel: Curtea de Apel Oradea, fișă cu ședințele din 08.11.2023 și 22.11.2023. Ședința din dosarul sursei rămâne la dosarul 2403/111/2025.')
heading('Limitele istoricului public')
p('Etapa fără fișă este marcată „Confirmat prin trimitere oficială”. Apelul singur nu certifică automat un fond. Serviciul public nu garantează istoricul complet: arhiva pasivă și datele confidențiale pot lipsi. O preluare reușită nu confirmă singură că toate ședințele istorice sunt disponibile. Confirmările istorice își păstrează data verificării și când serviciul nu răspunde.')
p('<a href="https://portal.just.ro/sitepages/despre.aspx" color="#0066cc">Acoperirea și actualizarea datelor explicate de portalul oficial</a>')

page('Cum citești legislația')
p('În Justiție, alege „Legislație”, selectează un cod sau caută un act după titlu, număr, an ori cuvinte. Fișa unui act și textul consolidat sunt verificate separat.')
heading('Cuprins apăsabil')
p('Lista „Cuprinsul actului” deschide un titlu, un capitol, o secțiune ori un articol. „Cuprins pe titluri și capitole” oferă legături către articole. Apăsarea pe un card de titlu sau capitol deschide toate articolele sale. Titlurile care se repetă în părți diferite au destinații separate.')
p('Paginile grupează până la 12 articole, fiecare afișat integral. Pentru un singur articol, apasă „Deschide articolul”. Poți merge la articolul precedent sau următor. „Revino la act” restaurează căutarea și pagina anterioară. Navigarea și căutarea în act folosesc textul deja încărcat.')
heading('Alineate, note și PDF')
p('Alineatele, literele și notele rămân în text. Articolele romane citate în notele unui cod cu articole numerotate arab nu sunt introduse ca articole separate în cuprins. Textul integral și exporturile păstrează conținutul sursei.')
p('„Descarcă PDF” exportă articolul întreg, inclusiv când se întinde pe mai multe pagini. „Descarcă actul integral” folosește forma oficială verificată. Documentele arată data formei și data verificării; o copie mai veche nu primește o dată nouă la un eșec de preluare.')
heading('Ce înseamnă datele afișate')
p('<b>Data formei oficiale</b> indică versiunea din istoricul Portalului Legislativ. <b>Verificată pentru</b> este ziua pentru care a fost selectată forma aplicabilă. <b>Istoric consultat la</b> este ora verificării. Data descărcării singură nu confirmă actualitatea legii.')

page('Actualizare și disponibilitate')
heading('Legislația verificată în această revizie')
manifest=json.loads((root/'public/legal-snapshots/manifest.json').read_text())
verified=[a for a in manifest['items'] if a.get('consolidation',{}).get('asOf')==today]
for act in verified:
    c=act['consolidation'];checked=datetime.fromisoformat(c['checkedAt'].replace('Z','+00:00')).astimezone(ZoneInfo('Europe/Bucharest'))
    p(f'<b>{escape(act["type"].capitalize())}</b>: forma din {c["versionDate"][8:10]}.{c["versionDate"][5:7]}.{c["versionDate"][:4]}, verificată pentru {today_label} la {checked:%H:%M} (ora României).')
pending=[a['type'].capitalize() for a in manifest['items'] if a not in verified]
if pending:p('Actualitatea integrală pentru '+today_label+' nu a fost confirmată pentru: '+escape(', '.join(pending))+'. Copiile istorice păstrate pentru trasabilitate nu sunt prezentate ca texte actuale.')
heading('Programul zilnic')
p('Rularea zilnică este programată la 03:00, ora României. Include cele șase coduri și actele deschise în cititor, preluând forma consolidată oficială aplicabilă. La prima deschidere, un alt act este verificat și intră în registrul de actualizare zilnică. Registrul nu este o copie exhaustivă a tuturor actelor din portal.')
p('O actualizare este confirmată numai după validarea textului integral și a istoricului. La indisponibilitatea sursei, se păstrează ultima formă verificată cu data ei reală. O rulare zilnică poate raporta acte amânate ori neconfirmate dacă instituția nu răspunde.')
heading('Vreme, știri și seturi de date')
p('La consultare, aplicația verifică datele când expiră intervalul lor de cache: 10 minute pentru observații ANM și prognoza Open-Meteo, 5 minute pentru avertizări ANM, 30 de minute pentru fluxurile RSS. Alte surse au intervale proprii, vizibile prin data ultimei preluări. Frecvența publicării de către instituție poate fi diferită.')
p('La HTTP 5xx se fac cel mult trei încercări. Pentru HTTP 429 este respectată pauza cerută de sursă. Cererile din interfață sunt limitate pentru a reduce aglomerarea; schimbarea selecției anulează rezultatele vechi.')

page('Descărcări și codul aplicației')
heading('PDF, CSV și Excel')
p('Alege formatul de export disponibil lângă date. Tabelele pot fi exportate în PDF, CSV ori Excel; textele și actele se descarcă în PDF. În registre, butonul de descărcare folosește datele afișate și indică sursa.')
heading('Cod și toate fișierele publicate')
p(f'Ghidurile reviziilor platformei sunt publicate la /downloads/ și expuse în aplicație în secțiunea „Ghidurile platformei”; ghidul acestei versiuni este Aflivra_v{revision}_Documentatie.pdf, iar ghidurile reviziilor anterioare rămân etichetate cu propria versiune.')
p('Codul și toate datele publicate sunt în depozitul Aflivra: clona le conține integral, fără dezarhivare. README.md conține instrucțiunile de rulare și istoricul reviziilor.')
p('Arhivele ZIP — Aflivra_Cod.zip cu codul și volumele Aflivra_Date_*.zip cu datele și imaginile, fiecare sub 20 MB, dezarhivate în același director — și inventarul lor cu mărimi și valorile SHA-256 (source-packages.json) sunt unelte locale, regenerate cu python3 scripts/package-source.py; nu sunt descărcări publicate.')
heading(f'Ce s-a schimbat în versiunea {revision}')
p('Fondul, apelul și recursul confirmate apar în parcursul aceluiași dosar. Butoanele etapelor deschid fișa și toate ședințele sale. O sentință menționată explicit într-o soluție oficială poate confirma fondul chiar când fișa sa lipsește. Confirmarea arată dosarul sursei, hotărârea și data verificării; dosarele au legături de navigare între ele.')
p('Pentru 6236/111/2017 este afișat fondul confirmat prin sentința 476/LM/2023 a Tribunalului Bihor, menționată în dosarul 2403/111/2025, alături de apelul de la Curtea de Apel Oradea. Ședințele dosarului sursei rămân separate. Verificările includ răspunsurile oficiale, navigarea apăsabilă, indexul persistent de confirmări, avariile sursei și exporturile PDF, CSV și Excel.')

SimpleDocTemplate(str(out),pagesize=(595.28,841.89),rightMargin=42,leftMargin=42,topMargin=43,bottomMargin=64,title=f'Aflivra - Ghidul versiunii {revision}',author='Aflivra').build(story,onFirstPage=footer,onLaterPages=footer)
print(json.dumps({'file':str(out),'revision':revision,'verifiedCodes':len(verified)}))
