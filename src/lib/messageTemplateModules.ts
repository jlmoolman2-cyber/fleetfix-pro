export const MESSAGE_TEMPLATE_MODULES = [
  "General",
  "JobCard",
  "Job Forms",
  "Job Photos",
  "Customer",
  "Customer Contact",
  "Appointment",
  "Query",
  "Quote",
  "Invoice",
  "Payment / Receipt",
  "Purchase Order",
  "GRV",
  "Supplier",
  "Inventory",
  "Notification",
  "User",
] as const;

export const MESSAGE_TEMPLATE_TAGS = [
  // General links and dates
  "{{link}}", "{{currentDate}}", "{{currentTime}}", "{{currentDateTime}}",
  // Company
  "{{companyName}}", "{{companyAddress}}", "{{companyPhone}}", "{{companyEmail}}", "{{companyVatNumber}}", "{{companyLogo}}",
  // Customer and contact
  "{{customerName}}", "{{customerContact}}", "{{customerEmail}}", "{{customerPhone}}", "{{customerAddress}}", "{{customerLink}}",
  // User and supplier
  "{{userName}}", "{{userEmail}}", "{{userLink}}", "{{supplierName}}", "{{supplierCode}}", "{{supplierEmail}}", "{{supplierLink}}",
  // Job card
  "{{jobNumber}}", "{{jobStatus}}", "{{jobType}}", "{{jobPriority}}", "{{jobDate}}", "{{jobTime}}", "{{jobDescription}}",
  "{{jobLink}}", "{{jobCardLink}}", "{{jobFormsLink}}", "{{jobPhotoAlbumLink}}", "{{queueNumber}}", "{{queuePosition}}",
  "{{estimatedDispatchTime}}", "{{estimatedRepairMinutes}}", "{{eta}}", "{{arrivalTime}}",
  // Vehicle, driver and technician
  "{{vehicleReg}}", "{{fleetNo}}", "{{vehicleMake}}", "{{vehicleModel}}", "{{vehicleVin}}", "{{vehicleMileage}}",
  "{{trailerReg}}", "{{trailerFleet}}", "{{driverName}}", "{{driverContact}}", "{{driverContactNumber}}",
  "{{technicianName}}", "{{technicianPhone}}", "{{employeeName}}", "{{breakdownLocation}}", "{{googleMapsLink}}",
  "{{branchName}}", "{{branchPhone}}", "{{branchEmail}}",
  // Queries
  "{{queryNumber}}", "{{querySubject}}", "{{queryDescription}}", "{{queryType}}", "{{queryStatus}}", "{{queryLink}}", "{{followUpDate}}",
  // Quotes
  "{{quoteNumber}}", "{{quotationNumber}}", "{{quoteAmount}}", "{{quoteLink}}", "{{quoteApprovalLink}}",
  // Invoices and payments
  "{{invoiceNumber}}", "{{invoiceAmount}}", "{{invoiceLink}}", "{{paymentAmount}}", "{{paymentReference}}", "{{receiptNumber}}", "{{receiptLink}}",
  // Purchase orders and GRVs
  "{{purchaseOrderNumber}}", "{{purchaseOrderAmount}}", "{{purchaseOrderLink}}", "{{grvNumber}}", "{{grvLink}}",
  // Inventory
  "{{partNumber}}", "{{itemDescription}}", "{{serialNumber}}", "{{stockLocation}}", "{{inventoryLink}}",
  // Other record information
  "{{referenceNumber}}", "{{notes}}", "{{comment}}", "{{createdBy}}", "{{completedBy}}",
] as const;
