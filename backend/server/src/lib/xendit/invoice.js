import axios from "axios"

const username = process.env.xendit_dev_secretkey 
// const username = process.env.xendit_prod_secretkey

const authString = `${username}:`;

const auth = Buffer.from(authString).toString("base64");
export const getInvoice = async(invoice_id) =>{
  //Get invoice request
  try{

    const response = await axios({
      method: 'GET',
      url: `https://api.xendit.co/v2/invoices/${invoice_id}`,
      headers: { 
        'Authorization': `Basic ${auth}`
      },
      timeout: 5000
    })
    
    return response.data
  }catch(error){
    //Error read invoice payment
    console.log("AXIOS GET INVOICE ERROR: ",error)
    throw error
  }
}

export const expireInvoice = async(invoice_id) =>{
  try{

    const response = await axios({
      method: 'POST',
      url: `https://api.xendit.co/invoices/${invoice_id}/expire!`,
      headers: { 
        'Authorization': `Basic ${auth}`
      },
      timeout: 5000
    })
    
    return response.data
  }catch(error){
    //Error expire invoice payment
    console.log("AXIOS EXPIRE INVOICE ERROR: ",error)
    throw error
  }
}

export const createInvoice = async (successPayment,failedPayment,tnNumber,amount,userInfo) => {
  const {info, items, metaData} = userInfo
  const userData = {info}
  const itemsData = items
  const metadata = metaData
  // const {
  //         "name": "PALAROTARY 2026 Merchandise",
  //         "quantity": 1,
  //         "price": amount,
  //         "category": "Trade & Tourism",
  //         "url": "https://www.halalexpophilippines.com/"
  //       }
  try {
    const paymentRequest={
      "external_id": `${tnNumber}`,
      "amount": amount,
      "description": `Invoice Transaction #${tnNumber}`,
      "customer":userData,
      "customer_notification_preference": {
        "invoice_created": [
          "email",
          "viber"
        ],
        "invoice_reminder": [
          "email",
          "viber"
        ],
        "invoice_paid": [
          "email",
          "viber"
        ]
      },
      "invoice_duration": 86400,
      // "invoice_duration": 300,   //5mins

      "success_redirect_url": successPayment,
      "failure_redirect_url": failedPayment,
      "payment_methods": [
          "CREDIT_CARD", 
          "7ELEVEN", 
          "CEBUANA", 
          "DD_BPI", 
          "DD_UBP", 
          "DD_RCBC", 
          "DD_BDO_EPAY", 
          "DP_MLHUILLIER", 
          "DP_PALAWAN", 
          "DP_ECPAY_LOAN", 
          "PAYMAYA", 
          "GRABPAY", 
          "GCASH", 
          "BILLEASE", 
          "CASHALO", 
          "BDO_ONLINE_BANKING", 
          "BPI_ONLINE_BANKING", 
          "UNIONBANK_ONILNE_BANKING", 
          "BOC_ONLINE_BANKING", 
          "CHINABANK_ONLINE_BANKING", 
          "INSTAPAY_ONLINE_BANKING", 
          "LANDBANK_ONLINE_BANKING", 
          "MAYBANK_ONLINE_BANKING", 
          "METROBANK_ONLINE_BANKING", 
          "PNB_ONLINE_BANKING", 
          "PSBANK_ONLINE_BANKING", 
          "PESONET_ONLINE_BANKING", 
          "RCBC_ONLINE_BANKING", 
          "ROBINSONS_BANK_ONLINE_BANKING", 
          "SECURITY_BANK_ONLINE_BANKING", 
          "QRPH"
      ],
      "currency": "PHP", 
      "items": itemsData,
      "metadata": metadata
    };
    const response = await axios({
      method: 'POST',
      url: 'https://api.xendit.co/v2/invoices',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Basic ${auth}`
      },
      data: JSON.stringify(paymentRequest),
      timeout: 5000
    })
    return response.data
  } catch (error) {
    console.log("AXIOS CREATE INVOICE ERROR: ",error)
    throw error
  }
};


