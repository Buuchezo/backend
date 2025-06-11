import nodemailer from 'nodemailer'

interface EmailOptions {
  email: string
  subject: string
  message: string
}

export const sendEmail = async (options: EmailOptions) => {
  // 1. Create transporter
  const transporter = nodemailer.createTransport({
    host:process.env.EMAIL_HOST,
    port:Number(process.env.EMAIL_PORT),
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },

    //ACTIVATE IN GMAIL "less secure app" option
  })

  // 2. Define mail options
  const mailOptions = {
    from: 'Kennedy Buchichi <lebrddoinbver@hasl.com>',
    to: options.email,
    subject: options.subject,
    text: options.message,
  }

  // 3. Send the email
  await transporter.sendMail(mailOptions)
}
