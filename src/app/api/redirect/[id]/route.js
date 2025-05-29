import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import useragent from "useragent";
import fetch from "node-fetch";

const prisma = new PrismaClient();

export async function GET(req, { params }) {
  const { id } = await params;
  var uniqueId = id;
  try {
    const qrCode = await prisma.qRCode.findUnique({
      where: { unique_id: id },
      select: { qr_experience: true, qr_code_type: true, qr_code_name: true },
    });
    if (!qrCode) {
      return NextResponse.json(
        { error: "QR Code not found." },
        { status: 404 }
      );
    }

    var qrCodeDetails;

    if (qrCode.qr_experience === "url") {
      qrCodeDetails = await prisma.qRCode.findUnique({
        where: { unique_id: id },
        select: { qr_experience: true, content_url: true },
      });
    } else if (qrCode.qr_experience === "sms") {
      qrCodeDetails = await prisma.qRCode.findUnique({
        where: { unique_id: id },
        select: {
          qr_experience: true,
          content_phone_number: true,
          content_sms_body: true,
        },
      });
    } else {
      return NextResponse.json(
        { error: "Unsupported QR Code experience type." },
        { status: 400 }
      );
    }

    if (qrCode.qr_code_type === "dynamic") {
      const ip =
        req.headers.get("x-forwarded-for") ||
        req.socket?.remoteAddress ||
        "100.200.300.400";

      const response = await fetch(`http://ip-api.com/json/${ip}`);
      const geo = await response.json();

      const scan_country = geo.country || "Unknown";
      const scan_state = geo.regionName || "Unknown";
      const scan_city = geo.city || "Unknown";

      const userAgent = req.headers.get("user-agent");
      const agent = useragent.parse(userAgent);
      const scan_os = agent.os.toString().split(" ")[0];

      const now = new Date();
      const scan_date = now.toISOString().split("T")[0]; // Format as YYYY-MM-DD
      const scan_time = now.toISOString();

      await prisma.qRScan.create({
        data: {
          qr_unique_id: uniqueId,
          qr_code_name: qrCode.qr_code_name,
          scan_date: new Date(scan_date),
          scan_time: scan_time,
          scan_country,
          scan_state,
          scan_city,
          scan_ip_hash: ip,
          scan_os,
        },
      });
    }

    if (qrCodeDetails.qr_experience === "url") {
      const redirectUrl =
        qrCodeDetails.content_url.startsWith("http://") ||
        qrCodeDetails.content_url.startsWith("https://")
          ? qrCodeDetails.content_url
          : `http://${qrCodeDetails.content_url}`;
      return NextResponse.redirect(redirectUrl);
    } else if (qrCodeDetails.qr_experience === "sms") {
      const smsLink = `sms:${
        qrCodeDetails.content_phone_number
      }?body=${encodeURIComponent(qrCodeDetails.content_sms_body || "")}`;
      return NextResponse.redirect(smsLink);
    }
    res.status(200).json({ message: "Scan recorded successfully" });
  } catch (error) {
    console.error("Error handling QR code redirect:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
