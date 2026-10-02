"""Render immutable paid fiscal facts; no Stripe Invoice API or external assets."""
from datetime import datetime, timezone
from decimal import Decimal
from html import escape
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

INK = colors.HexColor('#20252b')
MUTED = colors.HexColor('#66717f')
ACCENT = colors.HexColor('#de775e')
LIGHT = colors.HexColor('#f5f1ed')
PRAGUE = ZoneInfo('Europe/Prague')


def _fonts():
    directory = Path(__file__).resolve().parents[1] / 'assets' / 'fonts'
    for name, filename in (('Velora', 'NotoSans-Regular.ttf'), ('VeloraBold', 'NotoSans-Bold.ttf')):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(directory / filename)))


def _date(value):
    parsed = datetime.fromisoformat(str(value))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.astimezone(PRAGUE)
    return parsed.strftime('%d.%m.%Y')


def _money(minor, currency='EUR'):
    return f'{Decimal(minor) / 100:,.2f}'.replace(',', ' ').replace('.', ',') + ' ' + currency


def _plan_label(plan):
    if plan.startswith('s') and plan[1:].isdigit():
        return 'Počet zaměstnanců / Staff capacity: ' + plan[1:]
    return 'Bez limitu / Unlimited' if plan == 'unlimited' else plan


def render_tax_pdf(document, *, sample=False):
    """One immutable original, followed by its issued full-refund credit note."""
    if document.status != 'issued':
        raise ValueError('A pending document must not be rendered as a tax invoice')
    _fonts()
    stream = BytesIO()
    pdf = SimpleDocTemplate(stream, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                           topMargin=33*mm, bottomMargin=22*mm,
                           title=document.snapshot['document_number'], author='Velora')
    base = dict(fontName='Velora', textColor=INK, leading=14, fontSize=9)
    styles = {
        'body': ParagraphStyle('body', **base),
        'small': ParagraphStyle('small', **{**base, 'fontSize':8, 'leading':12, 'textColor':MUTED}),
        'heading': ParagraphStyle('heading', **{**base, 'fontName':'VeloraBold', 'fontSize':19, 'leading':25}),
        'label': ParagraphStyle('label', **{**base, 'fontName':'VeloraBold', 'fontSize':9}),
        'right': ParagraphStyle('right', **{**base, 'alignment':TA_RIGHT}),
        'total': ParagraphStyle('total', **{**base, 'fontName':'VeloraBold', 'fontSize':13, 'leading':19, 'alignment':TA_RIGHT}),
    }

    def p(text, style='body'):
        return Paragraph(escape(str(text)), styles[style])

    def party(data, seller=False):
        lines = [p(data['name' if seller else 'legal_name'], 'label'), p(data['line1'])]
        if data.get('line2'):
            lines.append(p(data['line2']))
        lines.append(p(f"{data['postal_code']} {data['city']}, {data['country']}"))
        if data.get('registration_id'):
            lines.append(p('IČO / Registration ID: ' + data['registration_id'], 'small'))
        if data.get('vat_id'):
            lines.append(p('DIČ / VAT ID: ' + data['vat_id'], 'small'))
        return lines

    def table(rows, widths, background=None):
        result = Table(rows, colWidths=widths, hAlign='LEFT')
        commands = [('VALIGN',(0,0),(-1,-1),'TOP'), ('LEFTPADDING',(0,0),(-1,-1),0),
                    ('RIGHTPADDING',(0,0),(-1,-1),12), ('TOPPADDING',(0,0),(-1,-1),6),
                    ('BOTTOMPADDING',(0,0),(-1,-1),6)]
        if background:
            commands.extend([('BACKGROUND',(0,0),(-1,-1),background),
                             ('LEFTPADDING',(0,0),(-1,-1),12), ('RIGHTPADDING',(0,0),(-1,-1),12)])
        result.setStyle(TableStyle(commands))
        return result

    def section(snapshot, correction=False):
        tax = snapshot['tax']
        title = 'Opravný daňový doklad' if correction else 'Daňový doklad k přijaté platbě'
        story = [p(title, 'heading'), p('Credit note' if correction else 'Payment tax document', 'small'),
                 Spacer(1, 5*mm), p(snapshot['document_number'], 'label')]
        if sample:
            story += [Spacer(1, 3*mm), p('VZOR / SAMPLE - NOT A VALID TAX DOCUMENT', 'label')]
        story += [Spacer(1, 6*mm), table([
            [p('Dodavatel / Seller', 'small'), p('Odběratel / Buyer', 'small')],
            [party(snapshot['seller'], True), party(snapshot['buyer'])],
        ], [85*mm,85*mm]), Spacer(1, 5*mm)]
        dates = [[p('Datum vystavení / Issue date', 'small'), p(_date(snapshot['issued_at']), 'right')],
                 [p('Datum přijetí platby / Payment received', 'small'), p(_date(snapshot['paid_at']), 'right')],
                 [p('Původní daňové datum / Original tax date' if correction else 'Datum povinnosti přiznat daň / Tax date', 'small'), p(_date(snapshot['tax_date']), 'right')]]
        if correction:
            dates += [[p('Původní doklad / Original document', 'small'), p(snapshot['original_document_number'], 'right')],
                      [p('Datum opravy a vrácení / Correction and refund date', 'small'), p(_date(snapshot['refunded_at']), 'right')]]
        story += [table(dates,[112*mm,58*mm]), Spacer(1,7*mm)]
        item = snapshot['item']
        story += [p('Předmět plnění / Service', 'label'), Spacer(1,2*mm),
                  p(f"Velora - {_plan_label(item['plan'])} - {item['period_months']} měsíc(e) / month(s)"),
                  p(f"Období přístupu / Access period: {_date(item['access_starts_at'])} - {_date(item['access_until'])}", 'small'),
                  p(f"Množství / Quantity: 1; cena bez DPH / net unit price: {_money(tax['net_minor'])}", 'small'),
                  p('Jednorázová platba, bez automatického obnovení / One-time payment, no automatic renewal', 'small'),
                  Spacer(1,5*mm)]
        rate = tax.get('rate_percent')
        vat_label = f'DPH / VAT {Decimal(str(rate)).normalize()} %' if tax['outcome'] == 'taxable' else 'DPH / VAT'
        totals = [[p('Základ daně / Net amount'), p(_money(tax['net_minor']), 'right')],
                  [p(vat_label), p(_money(tax['tax_minor']), 'right')],
                  [p('Celkem vráceno / Total refunded' if correction else 'Celkem uhrazeno / Total paid', 'label'),
                   p(_money(tax['total_minor']), 'total')]]
        story += [table(totals,[110*mm,60*mm],LIGHT), Spacer(1,4*mm),
                  p('DPH v českých korunách / VAT in CZK: ' + _money(snapshot['vat_czk_minor'],'CZK'), 'label'),
                  p('Základ daně v CZK / Net amount in CZK: ' + _money(snapshot['net_czk_minor'],'CZK'),'small')]
        if tax['outcome'] == 'reverse_charge':
            story += [Spacer(1,3*mm), p('daň odvede zákazník / Reverse charge','label')]
        elif tax['outcome'] in ('exempt','out_of_scope'):
            story += [Spacer(1,3*mm), p(tax.get('basis') or tax['outcome'],'small')]
        if correction:
            story += [Spacer(1,3*mm), p(snapshot['correction_reason'],'body')]
        fx = snapshot['fx']
        story += [Spacer(1,5*mm),
                  p(f"Kurz ČNB / CNB rate: 1 EUR = {fx['rate']} CZK; kurz ze dne / published {_date(fx['date'])}.",'small'),
                  p('Přepočet používá kurz platný pro původní daňové datum / Conversion uses the original tax date rate.','small'),
                  p(fx['source_url'],'small')]
        return story

    story = section(document.snapshot)
    correction = document.correction_snapshot
    if correction and correction.get('status') == 'issued':
        story += [PageBreak()] + section(correction['snapshot'], True)

    def frame(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(ACCENT)
        x,y=20*mm,A4[1]-22*mm
        for dx,dy in ((0,0),(6,0),(0,6),(6,6)):
            canvas.setFillColor(colors.HexColor('#F9A08B' if dx!=dy else '#FCCBBF'))
            canvas.roundRect(x+dx*mm,y+dy*mm,4.5*mm,4.5*mm,1*mm,fill=1,stroke=0)
        canvas.setFont('VeloraBold',18)
        canvas.setFillColor(INK)
        canvas.drawString(x+16*mm,y+2*mm,'Velora')
        canvas.setStrokeColor(colors.HexColor('#e7e1dc'))
        canvas.line(20*mm,18*mm,A4[0]-20*mm,18*mm)
        canvas.setFont('Velora',8)
        canvas.setFillColor(MUTED)
        canvas.drawString(20*mm,12*mm,'Velora | ' + document.snapshot['document_number'])
        canvas.drawRightString(A4[0]-20*mm,12*mm,str(doc.page))
        canvas.restoreState()

    pdf.build(story,onFirstPage=frame,onLaterPages=frame)
    return stream.getvalue()
