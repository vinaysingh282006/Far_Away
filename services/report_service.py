from config.config import logger

def generate_pdf_report():
    """
    Simulates WeasyPrint / ReportLab PDF generation.
    Returns the path to the generated PDF.
    """
    logger.info("Generating PDF report...")
    pdf_path = "static/report.pdf"
    with open(pdf_path, "w") as f:
        f.write("%PDF-1.4\n% Dummy PDF Content for Demo")
    return pdf_path
