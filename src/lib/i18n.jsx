import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export const LANGUAGES = { en: 'English', bn: 'বাংলা' }
const STORAGE_KEY = 'munchivo-lang'

/**
 * Bangla translation table.
 *
 * Keys are the exact English strings rendered in the UI, values are the
 * Bangla translations. Components call t('English text') and unsupported
 * strings fall back to English, so the app never breaks on a missing entry.
 * Placeholders like {count} are interpolated by t().
 */
const BANGLA = {
  // ---------------------------------------------------------------- common
  'Loading…': 'লোড হচ্ছে…',
  'Save': 'সংরক্ষণ করুন',
  'Saving…': 'সংরক্ষণ হচ্ছে…',
  'Cancel': 'বাতিল',
  'Close': 'বন্ধ করুন',
  'Add': 'যোগ করুন',
  'Edit': 'সম্পাদনা',
  'Delete': 'মুছে ফেলুন',
  'Archive': 'আর্কাইভ',
  'Restore': 'পুনরুদ্ধার',
  'Confirm': 'নিশ্চিত করুন',
  'View': 'দেখুন',
  'Record': 'রেকর্ড করুন',
  'Logout': 'লগ আউট',
  'Language': 'ভাষা',
  'English': 'English',
  'Bangla': 'বাংলা',
  'Yes': 'হ্যাঁ',
  'No': 'না',
  'Active': 'সক্রিয়',
  'Archived': 'আর্কাইভ করা',
  'All': 'সব',
  'None': 'কোনোটিই নেই',
  'Select': 'নির্বাচন করুন',
  'Required': 'আবশ্যক',
  'Search…': 'খুঁজুন…',
  'Notes': 'নোট',
  'Category': 'বিভাগ',
  'Status': 'অবস্থা',
  'Date': 'তারিখ',
  'Total': 'মোট',
  'Amount': 'পরিমাণ',
  'Quantity': 'পরিমাণ',
  'Unit': 'একক',
  'Reason': 'কারণ',
  'Method': 'পদ্ধতি',
  'Price': 'দাম',
  'Cost': 'ব্যয়',
  'Profit': 'লাভ',
  'Revenue': 'আয়',
  'Orders': 'অর্ডার',
  'Products': 'পণ্য',
  'Product': 'পণ্য',
  'Ingredient': 'উপকরণ',
  'Ingredients': 'উপকরণ',
  'Recipe': 'রেসিপি',
  'Partner': 'অংশীদার',
  'Owner': 'মালিক',
  'Management': 'ম্যানেজমেন্ট',
  'Munchivo': 'মুচিভো',
  'Confirmed': 'নিশ্চিতকৃত',
  'Cancelled': 'বাতিল',
  'Paid': 'পরিশোধিত',
  'Due': 'বাকি',
  'Pending': 'অপেক্ষমাণ',
  'Failed': 'ব্যর্থ',
  'Cash': 'নগদ',
  'bKash': 'বিকাশ',
  'Nagad': 'নগদ',
  'Other': 'অন্যান্য',
  'Today': 'আজ',
  'This month': 'এই মাস',
  'This year': 'এই বছর',
  'All time': 'সর্বকাল',
  'Since the beginning': 'শুরু থেকে',
  'Yesterday': 'গতকাল',
  'This week': 'এই সপ্তাহ',
  'Last 30 days': 'গত ৩০ দিন',
  'All categories': 'সব বিভাগ',
  'All statuses': 'সব অবস্থা',
  'No data yet': 'এখনো কোনো তথ্য নেই',
  'Something went wrong. Please try again.':
    'কিছু ভুল হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',

  // ---------------------------------------------------------------- layout
  'Open menu': 'মেনু খুলুন',
  'Toggle language': 'ভাষা পরিবর্তন করুন',
  'Main navigation': 'প্রধান নেভিগেশন',
  'Munchivo logo': 'মুচিভোর লোগো',
  'Overview': 'ওভারভিউ',
  'Operations': 'পরিচালনা',
  'Business': 'ব্যবসা',
  'System': 'সিস্টেম',
  'Dashboard': 'ড্যাশবোর্ড',
  'Sales Overview': 'বিক্রয় ওভারভিউ',
  'Inventory': 'ইনভেন্টরি',
  'Usage & Reconciliation': 'ব্যবহার ও মিলান',
  'Purchases': 'ক্রয়',
  'Recipes': 'রেসিপি',
  'Calculator': 'ক্যালকুলেটর',
  'Sales': 'বিক্রয়',
  'Waste': 'অপচয়',
  'Expiry': 'মেয়াদ',
  'Expenses': 'খরচ',
  'Partners': 'অংশীদার',
  'Reports': 'রিপোর্ট',
  'Notifications': 'নোটিফিকেশন',
  'Settings': 'সেটিংস',
  'Notifications ({count} unread)': 'নোটিফিকেশন ({count}টি অপঠিত)',

  // ------------------------------------------------------------------ auth
  'Business, inventory & financial control': 'ব্যবসা, ইনভেন্টরি ও আর্থিক ব্যবস্থাপনা',
  'Partner sign in': 'অংশীদার সাইন ইন',
  'Email': 'ইমেইল',
  'Password': 'পাসওয়ার্ড',
  'Email is required.': 'ইমেইল আবশ্যক।',
  'Enter a valid email address.': 'সঠিক ইমেইল ঠিকানা লিখুন।',
  'Password is required.': 'পাসওয়ার্ড আবশ্যক।',
  'Password must be at least 6 characters.':
    'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
  'Cannot reach the server. Is the API server running?':
    'সার্ভারে সংযোগ করা যাচ্ছে না। API সার্ভার চালু আছে কি?',
  'Hide password': 'পাসওয়ার্ড লুকান',
  'Show password': 'পাসওয়ার্ড দেখান',
  'Hide': 'লুকান',
  'Show': 'দেখান',
  'Sign in': 'সাইন ইন',
  'Signing in…': 'সাইন ইন হচ্ছে…',
  'Internal use only · Access restricted to Munchivo partners':
    'শুধুমাত্র অভ্যন্তরীণ ব্যবহারের জন্য · প্রবেশাধিকার মুচিভোর অংশীদারদের মধ্যে সীমাবদ্ধ',

  // ------------------------------------------------------------- dashboard
  'Good day,': 'শুভ দিন,',
  'Here is how Munchivo is doing today.':
    'আজ মুচিভোর অবস্থা এই রকম।',
  "Today's Revenue": 'আজকের আয়',
  "Today's Orders": 'আজকের অর্ডার',
  "Today's Gross Profit": 'আজকের মোট লাভ',
  'Revenue minus ingredient cost (COGS)': 'আয় বিয়োগ উপকরণের ব্যয় (COGS)',
  'Supplier Dues': 'সরবরাহকারীর বাকি',
  'Unpaid purchase balance': 'অপরিশোধিত ক্রয়ের বাকি',
  '{count} order today': 'আজ {count}টি অর্ডার',
  '{count} orders today': 'আজ {count}টি অর্ডার',
  'No sales recorded today': 'আজ কোনো বিক্রয় রেকর্ড হয়নি',
  'Keep it going!': 'এভাবেই এগিয়ে যান!',
  'No orders recorded today': 'আজ কোনো অর্ডার রেকর্ড হয়নি',
  'Revenue — last 14 days': 'আয় — গত ১৪ দিন',
  'View sales': 'বিক্রয় দেখুন',
  'Low Stock Alerts': 'কম স্টকের সতর্কতা',
  'All stock levels healthy': 'সব স্টকের মাত্রা স্বাভাবিক',
  'Set thresholds on ingredients and alerts appear here automatically.':
    'উপকরণে ন্যূনতম সীমা নির্ধারণ করুন, সতর্কতাগুলো এখানে স্বয়ংক্রিয়ভাবে দেখা যাবে।',
  'stock': 'স্টক',
  'threshold': 'সীমা',
  'Purchase': 'ক্রয়',
  'Recent Orders': 'সাম্প্রতিক অর্ডার',
  'All sales': 'সব বিক্রয়',
  'No orders yet': 'এখনো কোনো অর্ডার নেই',
  'Record your first sale to see it here.':
    'এখানে দেখতে প্রথম বিক্রয়টি রেকর্ড করুন।',
  'Expiring Soon': 'শিগগিরই মেয়াদ শেষ',
  'Expiry page': 'মেয়াদ পাতা',
  'Nothing expiring in 7 days': '৭ দিনের মধ্যে কোনো কিছুর মেয়াদ শেষ হচ্ছে না',
  'Purchase batches with expiry dates will surface here.':
    'মেয়াদ তারিখসহ ক্রয়ের ব্যাচ এখানে দেখা যাবে।',
  'expires': 'মেয়াদ শেষ',
  'Review': 'দেখুন',
  'Top Products — 30 days': 'শীর্ষ পণ্য — ৩০ দিন',
  'No sales in the last 30 days': 'গত ৩০ দিনে কোনো বিক্রয় হয়নি',
  '{count} sold': '{count}টি বিক্রি',
  'Waste This Month': 'এই মাসের অপচয়',
  'Waste log': 'অপচয়ের লগ',
  '{count} waste record this month.': 'এই মাসে {count}টি অপচয় রেকর্ড।',
  '{count} waste records this month.': 'এই মাসে {count}টি অপচয় রেকর্ড।',
  'No sales data yet': 'এখনো কোনো বিক্রয়ের তথ্য নেই',
  'Record your first sale and your daily revenue trend appears here.':
    'প্রথম বিক্রয় রেকর্ড করুন, আপনার দৈনিক আয়ের ধারা এখানে দেখা যাবে।',
  'Daily revenue for the last 14 days': 'গত ১৪ দিনের দৈনিক আয়',
  '{count} orders': '{count}টি অর্ডার',

  // --------------------------------------------------------------- overview
  'Revenue, cost and profit at a glance. Today updates automatically and resets at midnight — every record stays saved for the month, year and all-time totals.':
    'আয়, ব্যয় ও লাভ এক নজরে। আজকের হিসাব স্বয়ংক্রিয়ভাবে আপডেট হয় এবং মধ্যরাতে রিসেট হয় — প্রতিটি রেকর্ড মাস, বছর ও সর্বকালের মোটের জন্য সংরক্ষিত থাকে।',
  'Sales performance': 'বিক্রয়ের কর্মক্ষমতা',
  'Metric': 'সূচক',
  'Cost of goods': 'পণ্যের ব্যয়',
  'Items sold': 'বিক্রীত আইটেম',
  'Live totals from recorded sales · cancelled sales are excluded':
    'রেকর্ড করা বিক্রয় থেকে সরাসরি হিসাব · বাতিল বিক্রয় বাদ দেওয়া হয়েছে',
  'Sold today': 'আজ যা বিক্রি হয়েছে',
  'Nothing sold today yet': 'আজ এখনো কিছু বিক্রি হয়নি',
  "Record a sale and today's items, cost and profit appear here.":
    'একটি বিক্রয় রেকর্ড করুন, আজকের আইটেম, ব্যয় ও লাভ এখানে দেখা যাবে।',
  'Qty sold': 'বিক্রীত পরিমাণ',

  // -------------------------------------------------------------- inventory
  'Opening stock': 'প্রারম্ভিক স্টক',
  'Purchase reversal': 'ক্রয় ফেরানো',
  'Adjustment': 'সমন্বয়',
  'Sale consumption': 'বিক্রয়ে ব্যবহৃত',
  'Expired': 'মেয়াদোত্তীর্ণ',
  '{count} ingredient': '{count}টি উপকরণ',
  '{count} ingredients': '{count}টি উপকরণ',
  'Inventory value': 'ইনভেন্টরির মূল্য',
  '{count} running low': '{count}টি কমে যাচ্ছে',
  'Search ingredients…': 'উপকরণ খুঁজুন…',
  '+ Add Ingredient': '+ উপকরণ যোগ করুন',
  'No ingredients yet': 'এখনো কোনো উপকরণ নেই',
  'Add your first ingredient — for example Potato with 20 kg and a low-stock threshold of 7 kg.':
    'প্রথম উপকরণটি যোগ করুন — যেমন ২০ কেজি আলু এবং ৭ কেজি কম-স্টকের সীমা।',
  'Avg Cost': 'গড় ব্যয়',
  'Value': 'মূল্য',
  'Expiry tracked': 'মেয়াদ ট্র্যাক করা হয়',
  ' · below min': ' · ন্যূনতমের নিচে',
  ' · low': ' · কম',
  'Low stock': 'স্টক কম',
  'Healthy': 'স্বাভাবিক',
  'Archive "{name}"? History is kept; it can be restored anytime.':
    '"{name}" আর্কাইভ করবেন? ইতিহাস সংরক্ষিত থাকবে; যেকোনো সময় পুনরুদ্ধার করা যাবে।',

  // --------------------------------------------------------- ingredient form
  'New Ingredient': 'নতুন উপকরণ',
  'Edit {name}': '{name} সম্পাদনা করুন',
  'Ingredient name *': 'উপকরণের নাম *',
  'e.g. Potato': 'যেমন আলু',
  'e.g. Vegetables': 'যেমন সবজি',
  'Unit *': 'একক *',
  'Initial quantity ({unit})': 'প্রাথমিক পরিমাণ ({unit})',
  'e.g. 20': 'যেমন ২০',
  'Total purchase price (৳)': 'মোট ক্রয়মূল্য (৳)',
  'e.g. 1000': 'যেমন ১০০০',
  'Low-stock threshold ({unit})': 'কম-স্টকের সীমা ({unit})',
  'e.g. 7': 'যেমন ৭',
  'Minimum stock ({unit})': 'ন্যূনতম স্টক ({unit})',
  'e.g. 5': 'যেমন ৫',
  'Storage location': 'সংরক্ষণের স্থান',
  'e.g. Cold storage, shelf 2': 'যেমন হিমাগার, শেলফ ২',
  'Track expiry for this ingredient': 'এই উপকরণের মেয়াদ ট্র্যাক করুন',
  'Ingredient name is required.': 'উপকরণের নাম আবশ্যক।',
  'Unit is required.': 'একক আবশ্যক।',
  'Save changes': 'পরিবর্তন সংরক্ষণ করুন',
  'Add ingredient': 'উপকরণ যোগ করুন',

  // ------------------------------------------------------- usage & reconciliation
  'Last 7 days': 'গত ৭ দিন',
  'Custom': 'কাস্টম',
  'Stock': 'স্টক',
  'Staff meal': 'কর্মীদের খাবার',
  'Free sample': 'বিনামূল্যে নমুনা',
  'Testing / R&D': 'পরীক্ষা ও গবেষণা',
  'Personal use': 'ব্যক্তিগত ব্যবহার',
  'No consumption in this period.': 'এই সময়ে কোনো ব্যবহার হয়নি।',
  'Daily consumption cost': 'দৈনিক ব্যবহার ব্যয়',
  'No ingredient consumption yet.': 'এখনো কোনো উপকরণ ব্যবহার হয়নি।',
  'Sales consumption': 'বিক্রয়ে ব্যবহৃত',
  'Waste & spoilage': 'অপচয় ও নষ্ট',
  'Manual usage': 'ম্যানুয়াল ব্যবহার',
  'Inventory Usage & Reconciliation': 'ইনভেন্টরি ব্যবহার ও মিলান',
  'Track what ingredients are consumed, record manual usage, and reconcile physical stock at the end of each day. All figures come from the stock ledger.':
    'কোন উপকরণ কতটা ব্যবহৃত হচ্ছে তা ট্র্যাক করুন, ম্যানুয়াল ব্যবহার রেকর্ড করুন এবং প্রতিদিন শেষে প্রকৃত স্টক মিলিয়ে নিন। সব সংখ্যা স্টক লেজার থেকে নেওয়া।',
  'Daily Report': 'দৈনিক রিপোর্ট',
  'Reconciliation': 'মিলান',
  'Total consumption cost': 'মোট ব্যবহার ব্যয়',
  'Ingredients used': 'ব্যবহৃত উপকরণ',
  'Unusual consumption': 'অস্বাভাবিক ব্যবহার',
  'vs. previous period': 'আগের সময়ের তুলনায়',
  'Expected closing value': 'প্রত্যাশিত সমাপনী মূল্য',
  'Stock on hand at avg cost': 'গড় ব্যয়ে হাতে থাকা স্টক',
  'Net qty {qty} base': 'নেট পরিমাণ {qty} বেস',
  'Unusually high consumption:': 'অস্বাভাবিক বেশি ব্যবহার:',
  'Usage by type': 'ধরন অনুযায়ী ব্যবহার',
  'Ingredient-wise consumption': 'উপকরণভিত্তিক ব্যবহার',
  'Ingredient breakdown': 'উপকরণের বিস্তারিত',
  'No consumption recorded': 'কোনো ব্যবহার রেকর্ড হয়নি',
  'Sales, waste and manual usage will appear here.':
    'বিক্রয়, অপচয় ও ম্যানুয়াল ব্যবহার এখানে দেখা যাবে।',
  'Total qty': 'মোট পরিমাণ',
  'Recent manual usage': 'সাম্প্রতিক ম্যানুয়াল ব্যবহার',
  '{count} confirmed': '{count}টি নিশ্চিত',
  'No manual usage recorded': 'কোনো ম্যানুয়াল ব্যবহার রেকর্ড হয়নি',
  'Staff meals, samples, testing and other non-sale usage appear here.':
    'কর্মীদের খাবার, নমুনা, পরীক্ষা এবং বিক্রয়বহির্ভূত অন্যান্য ব্যবহার এখানে দেখা যাবে।',
  'By': 'কর্তৃক',
  'cancelled': 'বাতিল',
  'Cancel this manual usage and return the stock?':
    'এই ম্যানুয়াল ব্যবহার বাতিল করে স্টক ফিরিয়ে দেবেন?',
  'Record manual usage': 'ম্যানুয়াল ব্যবহার রেকর্ড করুন',
  'Record Manual Usage': 'ম্যানুয়াল ব্যবহার রেকর্ড করুন',
  'Select an ingredient.': 'একটি উপকরণ নির্বাচন করুন।',
  'Quantity must be greater than zero.': 'পরিমাণ শূন্যের বেশি হতে হবে।',
  'Confirm this stock usage? It will deduct inventory.':
    'এই স্টক ব্যবহার নিশ্চিত করবেন? ইনভেন্টরি থেকে কেটে নেওয়া হবে।',
  'Ingredient *': 'উপকরণ *',
  '— select —': '— নির্বাচন করুন —',
  'stock:': 'স্টক:',
  'Reason *': 'কারণ *',
  'Estimated cost': 'আনুমানিক ব্যয়',
  'Record usage': 'ব্যবহার রেকর্ড করুন',
  'Search ingredient…': 'উপকরণ খুঁজুন…',
  'Export CSV': 'CSV এক্সপোর্ট করুন',
  'No movements on {date}': '{date} তারিখে কোনো লেনদেন নেই',
  'Choose another date or record sales / usage.':
    'অন্য তারিখ বেছে নিন অথবা বিক্রয় / ব্যবহার রেকর্ড করুন।',
  'Daily usage — {date}': 'দৈনিক ব্যবহার — {date}',
  'Cost {cost}': 'ব্যয় {cost}',
  'Opening': 'প্রারম্ভিক',
  'Purchased': 'ক্রয়কৃত',
  'Production': 'উৎপাদন',
  'Total used': 'মোট ব্যবহৃত',
  'Total consumed': 'মোট ব্যবহৃত',
  'Expected': 'প্রত্যাশিত',
  'Actual': 'প্রকৃত',
  'Expected closing': 'প্রত্যাশিত সমাপনী',
  'Actual closing': 'প্রকৃত সমাপনী',
  'Consumption cost': 'ব্যবহার ব্যয়',
  'Diff': 'পার্থক্য',
  'Reconciliation saved. Stock adjusted to the counted quantities.':
    'মিলান সংরক্ষণ হয়েছে। গণনা করা পরিমাণ অনুযায়ী স্টক সমন্বয় করা হয়েছে।',
  'Business date': 'ব্যবসার তারিখ',
  '{count} of {total} counted': '{total}টির মধ্যে {count}টি গণনা করা হয়েছে',
  'You are viewing {date}. Only today can be confirmed; past days are read-only.':
    'আপনি {date} দেখছেন। কেবল আজকের হিসাব নিশ্চিত করা যাবে; আগের দিনগুলো শুধু দেখা যাবে।',
  'Physical count — {date}': 'প্রকৃত গণনা — {date}',
  'No stock to reconcile.': 'মিলানোর মতো স্টক নেই।',
  'Actual count': 'প্রকৃত গণনা',
  'Difference': 'পার্থক্য',
  'Explanation': 'ব্যাখ্যা',
  'Reason (if different)': 'কারণ (ভিন্ন হলে)',
  'Confirm reconciliation': 'মিলান নিশ্চিত করুন',
  'Confirming creates an explicit stock adjustment for any difference.':
    'নিশ্চিত করলে যেকোনো পার্থক্যের জন্য আলাদা স্টক সমন্বয় তৈরি হবে।',
  'Reconciliation history': 'মিলানের ইতিহাস',
  'No reconciliations recorded yet.': 'এখনো কোনো মিলান রেকর্ড হয়নি।',

  // --------------------------------------------------------------- purchases
  'Confirmed purchases automatically increase ingredient stock.':
    'নিশ্চিতকৃত ক্রয় স্বয়ংক্রিয়ভাবে উপকরণের স্টক বাড়ায়।',
  'All purchases': 'সব ক্রয়',
  'Add at least one ingredient before recording a purchase.':
    'ক্রয় রেকর্ড করার আগে কমপক্ষে একটি উপকরণ যোগ করুন।',
  '+ New Purchase': '+ নতুন ক্রয়',
  'No purchases yet': 'এখনো কোনো ক্রয় নেই',
  'Record your first purchase — stock, average cost and supplier dues will update automatically.':
    'প্রথম ক্রয়টি রেকর্ড করুন — স্টক, গড় ব্যয় ও সরবরাহকারীর বাকি স্বয়ংক্রিয়ভাবে আপডেট হবে।',
  'Items': 'আইটেম',
  '{count} item': '{count}টি আইটেম',
  '{count} items': '{count}টি আইটেম',
  'New Purchase': 'নতুন ক্রয়',
  'Purchase date *': 'ক্রয়ের তারিখ *',
  'Invoice number': 'চালান নম্বর',
  'Quantity ({unit})': 'পরিমাণ ({unit})',
  'Total cost (৳)': 'মোট ব্যয় (৳)',
  'Expiry (optional)': 'মেয়াদ (ঐচ্ছিক)',
  '+ Add another item': '+ আরেকটি আইটেম যোগ করুন',
  'Payment method': 'পেমেন্ট পদ্ধতি',
  'Paid now (৳, rest becomes due)': 'এখন পরিশোধিত (৳, বাকিটা বাকি থাকবে)',
  'Confirm purchase': 'ক্রয় নিশ্চিত করুন',
  'Add at least one item with an ingredient and quantity.':
    'কমপক্ষে একটি উপকরণ ও পরিমাণসহ আইটেম যোগ করুন।',
  'Every item needs a total cost (0 or more).':
    'প্রতিটি আইটেমের মোট ব্যয় (০ বা বেশি) দিতে হবে।',
  'Cancel this purchase? Stock will be reversed and history kept.':
    'এই ক্রয় বাতিল করবেন? স্টক ফিরিয়ে নেওয়া হবে এবং ইতিহাস সংরক্ষিত থাকবে।',
  'Purchase — {date}': 'ক্রয় — {date}',
  'Due {amount}': 'বাকি {amount}',
  'Fully paid': 'সম্পূর্ণ পরিশোধিত',
  'Payments': 'পেমেন্ট',
  'No payments recorded.': 'কোনো পেমেন্ট রেকর্ড হয়নি।',
  'Record payment': 'পেমেন্ট রেকর্ড করুন',
  'Amount (৳)': 'পরিমাণ (৳)',
  'Save payment': 'পেমেন্ট সংরক্ষণ করুন',
  'Cancel this purchase (reverses stock)':
    'এই ক্রয় বাতিল করুন (স্টক ফিরিয়ে নেওয়া হবে)',
  'This purchase was cancelled — its stock effects were reversed.':
    'এই ক্রয় বাতিল করা হয়েছে — এর স্টকের প্রভাব ফিরিয়ে নেওয়া হয়েছে।',

  // ----------------------------------------------------------------- recipes
  'Costs update automatically from current ingredient prices.':
    'বর্তমান উপকরণের দাম থেকে ব্যয় স্বয়ংক্রিয়ভাবে আপডেট হয়।',
  'Add at least one ingredient first (Inventory → Add Ingredient).':
    'আগে কমপক্ষে একটি উপকরণ যোগ করুন (ইনভেন্টরি → উপকরণ যোগ করুন)।',
  '+ New Recipe': '+ নতুন রেসিপি',
  'No recipes yet': 'এখনো কোনো রেসিপি নেই',
  'Create your first recipe — for example Signature Mayo with a base yield of 250 g — and see its cost per gram instantly.':
    'আপনার প্রথম রেসিপি তৈরি করুন — যেমন ২৫০ গ্রাম বেসিক ফলনের সিগনেচার মায়ো — এবং প্রতি গ্রামের ব্যয় সাথে সাথে দেখুন।',
  'Base yield': 'বেসিক ফলন',
  'Batch cost': 'ব্যাচের ব্যয়',
  'Per 1 g/ml/pc': 'প্রতি ১ গ্রাম/মিলি/পিস',
  'Archive "{name}"? It can be restored anytime.':
    '"{name}" আর্কাইভ করবেন? যেকোনো সময় পুনরুদ্ধার করা যাবে।',
  'New Recipe': 'নতুন রেসিপি',
  'Recipe name *': 'রেসিপির নাম *',
  'e.g. Signature Mayo': 'যেমন সিগনেচার মায়ো',
  'e.g. Sauces': 'যেমন সস',
  'Prep time (minutes)': 'প্রস্তুতির সময় (মিনিট)',
  'Base yield *': 'বেসিক ফলন *',
  'e.g. 250': 'যেমন ২৫০',
  'Yield unit *': 'ফলনের একক *',
  'Qty': 'পরিমাণ',
  '＋ Create new ingredient…': '＋ নতুন উপকরণ তৈরি করুন…',
  '+ Add ingredient': '+ উপকরণ যোগ করুন',
  'Packaging cost per batch (৳)': 'প্রতি ব্যাচ প্যাকেজিং ব্যয় (৳)',
  'Other direct costs (৳)': 'অন্যান্য সরাসরি ব্যয় (৳)',
  'Preparation instructions': 'প্রস্তুতির নির্দেশনা',
  'Step-by-step instructions…': 'ধাপে ধাপে নির্দেশনা…',
  'Ingredient cost': 'উপকরণের ব্যয়',
  'Batch total cost': 'ব্যাচের মোট ব্যয়',
  'Cost per 1 {unit}': 'প্রতি ১ {unit} ব্যয়',
  'Create recipe': 'রেসিপি তৈরি করুন',
  'Recipe name is required.': 'রেসিপির নাম আবশ্যক।',
  'Base yield must be greater than zero.': 'বেসিক ফলন শূন্যের বেশি হতে হবে।',
  'Add at least one ingredient with a quantity.':
    'পরিমাণসহ কমপক্ষে একটি উপকরণ যোগ করুন।',

  // -------------------------------------------------------------- calculator
  'Plan and cost any batch — calculations never touch your inventory.':
    'যেকোনো ব্যাচের পরিকল্পনা ও ব্যয় নির্ণয় করুন — গণনা কখনো আপনার ইনভেন্টরি স্পর্শ করে না।',
  'Recipe Scaling': 'রেসিপি স্কেলিং',
  'Custom Calculation': 'কাস্টম গণনা',
  '— select a recipe —': '— একটি রেসিপি নির্বাচন করুন —',
  'Target yield {unit}': 'লক্ষ্য ফলন {unit}',
  'e.g. 500': 'যেমন ৫০০',
  'Select a recipe to scale': 'স্কেল করার জন্য একটি রেসিপি নির্বাচন করুন',
  'Original: 250 g → target 500 g doubles every ingredient; 1 kg quadruples it. Decimals supported.':
    'মূল: ২৫০ গ্রাম → লক্ষ্য ৫০০ গ্রাম হলে প্রতিটি উপকরণ দ্বিগুণ হয়; ১ কেজি হলে চার গুণ হয়। দশমিক সমর্থিত।',
  'Original yield': 'মূল ফলন',
  'Target yield': 'লক্ষ্য ফলন',
  'Scaled ingredients': 'স্কেল করা উপকরণ',
  'Original': 'মূল',
  'Scaled': 'স্কেল করা',
  'Stock after use': 'ব্যবহারের পর স্টক',
  'Short by {qty}': 'ঘাটতি {qty}',
  'Estimated batch cost': 'আনুমানিক ব্যাচ ব্যয়',
  'Stock shortfall — purchase more first': 'স্টকের ঘাটতি — আগে আরও ক্রয় করুন',
  'Estimate only — nothing has been deducted from inventory.':
    'শুধুমাত্র আনুমানিক হিসাব — ইনভেন্টরি থেকে কিছুই কাটা হয়নি।',
  'Ingredients (any quantities)': 'উপকরণ (যেকোনো পরিমাণ)',
  'Qty ({unit})': 'পরিমাণ ({unit})',
  'Totals': 'মোট',
  'Total weight': 'মোট ওজন',
  'Total volume': 'মোট আয়তন',
  'Total pieces': 'মোট পিস',
  'Estimated total cost': 'আনুমানিক মোট ব্যয়',
  'Save as recipe': 'রেসিপি হিসেবে সংরক্ষণ করুন',
  'Give the recipe a name.': 'রেসিপির একটি নাম দিন।',
  'Save calculation as recipe': 'গণনা রেসিপি হিসেবে সংরক্ষণ করুন',
  'Yield unit': 'ফলনের একক',
  '{count} ingredient will be saved with the quantities from this calculation.':
    'এই গণনার পরিমাণসহ {count}টি উপকরণ সংরক্ষণ করা হবে।',
  '{count} ingredients will be saved with the quantities from this calculation.':
    'এই গণনার পরিমাণসহ {count}টি উপকরণ সংরক্ষণ করা হবে।',
  'Save recipe': 'রেসিপি সংরক্ষণ করুন',

  // ---------------------------------------------------------------- products
  'Your sellable menu. Profits below are estimates from current ingredient costs — realized profits arrive with the Sales module.':
    'আপনার বিক্রয়যোগ্য মেনু। নিচের লাভ বর্তমান উপকরণের ব্যয় থেকে আনুমানিক — প্রকৃত লাভ বিক্রয় মডিউলে পাওয়া যায়।',
  '+ Add Product': '+ পণ্য যোগ করুন',
  'No products yet': 'এখনো কোনো পণ্য নেই',
  'Create your menu — assign a recipe to each product to see live profitability estimates.':
    'আপনার মেনু তৈরি করুন — প্রতিটি পণ্যে একটি রেসিপি নিয়োগ করে লাভের আনুমানিক হিসাব দেখুন।',
  'Est. cost': 'আনু. ব্যয়',
  'Est. margin': 'আনু. লাভ',
  'Archive "{name}"? Sales history is kept.':
    '"{name}" আর্কাইভ করবেন? বিক্রয়ের ইতিহাস সংরক্ষিত থাকবে।',
  'Product name *': 'পণ্যের নাম *',
  'e.g. Egg Sando': 'যেমন এগ স্যান্ডো',
  'Or create new category': 'অথবা নতুন বিভাগ তৈরি করুন',
  'e.g. Sandwiches': 'যেমন স্যান্ডউইচ',
  'Selling price (৳) *': 'বিক্রয়মূল্য (৳) *',
  'Assigned recipe': 'নিয়োজিত রেসিপি',
  'Packaging cost per serving (৳)': 'প্রতি পরিবেশনে প্যাকেজিং ব্যয় (৳)',
  'Description': 'বিবরণ',
  'Add Product': 'পণ্য যোগ করুন',
  'Add product': 'পণ্য যোগ করুন',
  'Product name is required.': 'পণ্যের নাম আবশ্যক।',
  'Selling price must be greater than zero.': 'বিক্রয়মূল্য শূন্যের বেশি হতে হবে।',
  '— none —': '— কোনোটিই নেই —',

  // ------------------------------------------------------------------- waste
  'Spoiled': 'নষ্ট',
  'Burnt / overcooked': 'পোড়া / অতিরিক্ত রান্না',
  'Preparation mistake': 'প্রস্তুতির ভুল',
  'Damaged': 'ক্ষতিগ্রস্ত',
  'Every waste record deducts stock with an immutable movement — the trail can never be edited, only reversed by cancellation.':
    'প্রতিটি অপচয় রেকর্ড অপরিবর্তনীয় স্টক হ্রাস করে — এই রেকর্ড কখনো সম্পাদনা করা যায় না, কেবল বাতিল করে ফেরানো যায়।',
  'Waste cost this month': 'এই মাসের অপচয় ব্যয়',
  'Records this month': 'এই মাসের রেকর্ড',
  '+ Record Waste': '+ অপচয় রেকর্ড করুন',
  'No waste recorded': 'কোনো অপচয় রেকর্ড হয়নি',
  'Record spoiled or expired stock here so your costs stay honest.':
    'নষ্ট বা মেয়াদোত্তীর্ণ স্টক এখানে রেকর্ড করুন যাতে খরচের হিসাব সঠিক থাকে।',
  'Item': 'আইটেম',
  'Cancel this waste record? The stock will be returned.':
    'এই অপচয় রেকর্ড বাতিল করবেন? স্টক ফেরত দেওয়া হবে।',
  'Record Waste': 'অপচয় রেকর্ড করুন',
  'Record waste': 'অপচয় রেকর্ড করুন',
  'Recording…': 'রেকর্ড হচ্ছে…',
  '{count} base': '{count} বেস',

  // ------------------------------------------------------------------ expiry
  'Use ingredients before they expire — record waste for anything that has gone bad so costs stay accurate.':
    'মেয়াদ শেষ হওয়ার আগেই উপকরণ ব্যবহার করুন — নষ্ট হওয়া জিনিসের জন্য অপচয় রেকর্ড করুন যাতে খরচ সঠিক থাকে।',
  'Ingredient batches expiring within 7 days': '৭ দিনের মধ্যে মেয়াদ শেষ হওয়া উপকরণের ব্যাচ',
  '{count} batches': '{count}টি ব্যাচ',
  'Nothing expiring soon': 'শিগগিরই কোনো মেয়াদ শেষ হচ্ছে না',
  'Purchase batches with expiry dates will appear here 7 days before expiry.':
    'মেয়াদ তারিখসহ ক্রয়ের ব্যাচ মেয়াদ শেষের ৭ দিন আগে এখানে দেখা যাবে।',
  'Remaining': 'বাকি',
  'Expiry date': 'মেয়াদ তারিখ',
  'expired': 'মেয়াদোত্তীর্ণ',
  'expiring': 'মেয়াদশেষী',
  '{count} day left': '{count} দিন বাকি',
  '{count} days left': '{count} দিন বাকি',
  'Record as waste': 'অপচয় হিসেবে রেকর্ড করুন',
  'Record ALL remaining {name} ({qty}) as {type} waste? This deducts it from stock.':
    'অবশিষ্ট সব {name} ({qty}) {type} অপচয় হিসেবে রেকর্ড করবেন? এটি স্টক থেকে কেটে নেওয়া হবে।',
  'From Expiry page (batch expiry {date})': 'মেয়াদ পাতা থেকে (ব্যাচের মেয়াদ {date})',

  // ------------------------------------------------------------------- sales
  'Recording a sale deducts the product\'s recipe ingredients automatically. Profits use the real cost at the moment of sale.':
    'একটি বিক্রয় রেকর্ড করলে পণ্যের রেসিপির উপকরণ স্বয়ংক্রিয়ভাবে কেটে নেওয়া হয়। লাভের হিসাবে বিক্রয়ের মুহূর্তের প্রকৃত ব্যয় ব্যবহৃত হয়।',
  'Orders (filtered)': 'অর্ডার (ফিল্টার করা)',
  'Revenue (after refunds)': 'আয় (রিফান্ডের পর)',
  'Gross profit': 'মোট লাভ',
  'From date': 'শুরুর তারিখ',
  'To date': 'শেষ তারিখ',
  'All payments': 'সব পেমেন্ট',
  '+ New Sale': '+ নতুন বিক্রয়',
  'No sales recorded': 'কোনো বিক্রয় রেকর্ড হয়নি',
  'Record your first sale — inventory and profit update automatically.':
    'প্রথম বিক্রয় রেকর্ড করুন — ইনভেন্টরি ও লাভ স্বয়ংক্রিয়ভাবে আপডেট হবে।',
  'Order': 'অর্ডার',
  'Refunded': 'রিফান্ডকৃত',
  'Payment': 'পেমেন্ট',
  'New Sale': 'নতুন বিক্রয়',
  'Add at least one product with a quantity.':
    'পরিমাণসহ কমপক্ষে একটি পণ্য যোগ করুন।',
  '+ Add product': '+ পণ্য যোগ করুন',
  'Discount (৳)': 'ছাড় (৳)',
  'Sale date': 'বিক্রয়ের তারিখ',
  'Subtotal': 'উপমোট',
  'Discount': 'ছাড়',
  'Record sale': 'বিক্রয় রেকর্ড করুন',
  'Cancel this order? ALL inventory deductions will be reversed.':
    'এই অর্ডার বাতিল করবেন? সব ইনভেন্টরি কর্তন ফিরিয়ে নেওয়া হবে।',
  'Order {number}': 'অর্ডার {number}',
  'recorded by': 'রেকর্ড করেছেন',
  'Refund history': 'রিফান্ডের ইতিহাস',
  'Refund': 'রিফান্ড',
  'Record refund': 'রিফান্ড রেকর্ড করুন',
  'Cancel order': 'অর্ডার বাতিল করুন',
  'Refunds are financial only — perishable goods are not returned to inventory. Refundable:':
    'রিফান্ড শুধু আর্থিক — পচনশীল পণ্য ইনভেন্টরিতে ফেরত নেওয়া হয় না। রিফান্ডযোগ্য:',
  'e.g. customer returned item': 'যেমন গ্রাহক পণ্য ফেরত দিয়েছেন',
  'Enter a refund amount.': 'রিফান্ডের পরিমাণ লিখুন।',

  // ---------------------------------------------------------------- expenses
  'Bank': 'ব্যাংক',
  'Paid & unpaid': 'পরিশোধিত ও অপরিশোধিত',
  'Unpaid': 'অপরিশোধিত',
  'Rent, utilities, salaries, marketing and every other operating cost. Ingredient purchases are tracked separately under Purchases.':
    'ভাড়া, ইউটিলিটি, বেতন, মার্কেটিং ও অন্যান্য সব পরিচালন ব্যয়। উপকরণের ক্রয় আলাদাভাবে ক্রয় পাতায় ট্র্যাক করা হয়।',
  'Expenses this month': 'এই মাসের খরচ',
  '{count} record': '{count}টি রেকর্ড',
  '{count} records': '{count}টি রেকর্ড',
  '{count} unpaid bill': '{count}টি অপরিশোধিত বিল',
  '{count} unpaid bills': '{count}টি অপরিশোধিত বিল',
  'Settled this month': 'এই মাসে পরিশোধিত',
  'Categories': 'বিভাগসমূহ',
  'Operating cost types': 'পরিচালন ব্যয়ের ধরন',
  'Expense month': 'খরচের মাস',
  'Filter by category': 'বিভাগ অনুযায়ী ফিল্টার',
  'Filter by status': 'অবস্থা অনুযায়ী ফিল্টার',
  'Filter by payment': 'পেমেন্ট অনুযায়ী ফিল্টার',
  'Search description…': 'বিবরণ খুঁজুন…',
  'Search expenses': 'খরচ খুঁজুন',
  '+ Add Expense': '+ খরচ যোগ করুন',
  'No expenses recorded': 'কোনো খরচ রেকর্ড হয়নি',
  'Add rent, utility bills, salaries and other running costs so your Reports page can show a true net profit.':
    'ভাড়া, ইউটিলিটি বিল, বেতন ও অন্যান্য চলতি খরচ যোগ করুন যাতে রিপোর্ট পাতা প্রকৃত নিট লাভ দেখাতে পারে।',
  'Recorded by': 'রেকর্ড করেছেন',
  'Uncategorised': 'বিভাগহীন',
  'Mark unpaid': 'অপরিশোধিত চিহ্নিত করুন',
  'Mark paid': 'পরিশোধিত চিহ্নিত করুন',
  'Cancel "{description}"? The record stays in history.':
    '"{description}" বাতিল করবেন? রেকর্ডটি ইতিহাসে থেকে যাবে।',
  'Edit expense': 'খরচ সম্পাদনা করুন',
  'Add expense': 'খরচ যোগ করুন',
  'Description *': 'বিবরণ *',
  'e.g. Electricity bill — November': 'যেমন বিদ্যুৎ বিল — নভেম্বর',
  '+ New category': '+ নতুন বিভাগ',
  'New category name': 'নতুন বিভাগের নাম',
  'Adding…': 'যোগ হচ্ছে…',
  'Amount (৳) *': 'পরিমাণ (৳) *',
  'Date *': 'তারিখ *',
  'Payment status': 'পেমেন্টের অবস্থা',
  'Already paid': 'ইতিমধ্যে পরিশোধিত',
  'Paid on': 'পরিশোধের তারিখ',
  'Optional reference, invoice number or note': 'ঐচ্ছিক রেফারেন্স, চালান নম্বর বা নোট',
  'Description is required.': 'বিবরণ আবশ্যক।',
  'Amount must be greater than zero.': 'পরিমাণ শূন্যের বেশি হতে হবে।',
  'Choose a valid expense date.': 'সঠিক খরচের তারিখ নির্বাচন করুন।',

  // ---------------------------------------------------------------- partners
  'Capital in': 'মূলধন জমা',
  'Drawing': 'উত্তোলন',
  'Profit share': 'লাভের অংশ',
  'Loan to business': 'ব্যবসাকে ঋণ',
  'Loan repayment': 'ঋণ পরিশোধ',
  'Ownership, capital, drawings and loans for each business partner. Positive balances are owed by the business to the partner.':
    'প্রতিটি ব্যবসায়িক অংশীদারের মালিকানা, মূলধন, উত্তোলন ও ঋণ। ধনাত্মক ব্যালেন্স মানে ব্যবসা অংশীদারকে ঋণী।',
  'Active partners': 'সক্রিয় অংশীদার',
  'Combined ownership {pct}': 'সম্মিলিত মালিকানা {pct}',
  'Capital contributed': 'প্রদত্ত মূলধন',
  'Money partners put into the business': 'অংশীদাররা ব্যবসায় যে টাকা দিয়েছেন',
  'Total drawings': 'মোট উত্তোলন',
  'Money taken out by partners': 'অংশীদাররা যে টাকা তুলে নিয়েছেন',
  'Net partner balance': 'অংশীদারের নিট ব্যালেন্স',
  'Capital + profit share + loans − drawings':
    'মূলধন + লাভের অংশ + ঋণ − উত্তোলন',
  'Active ownership adds up to {pct}. Adjust partner percentages so the total is exactly 100%.':
    'সক্রিয় মালিকানা মোট {pct}। শতাংশ সমন্বয় করুন যাতে মোট ঠিক ১০০% হয়।',
  '+ Add Partner': '+ অংশীদার যোগ করুন',
  'No partners yet': 'এখনো কোনো অংশীদার নেই',
  'Add each partner with their ownership percentage, then record capital, drawings and loans in their ledger.':
    'প্রতিটি অংশীদারকে তাদের মালিকানার শতাংশসহ যোগ করুন, তারপর তাদের লেজারে মূলধন, উত্তোলন ও ঋণ রেকর্ড করুন।',
  'Ownership': 'মালিকানা',
  'Drawings': 'উত্তোলন',
  'Net balance': 'নিট ব্যালেন্স',
  'Inactive': 'নিষ্ক্রিয়',
  'Ledger ({count})': 'লেজার ({count})',
  'Deactivate': 'নিষ্ক্রিয় করুন',
  'Reactivate': 'পুনরায় সক্রিয় করুন',
  'Deactivate {name}? Their ledger history is kept.':
    '{name}-কে নিষ্ক্রিয় করবেন? তাদের লেজার ইতিহাস সংরক্ষিত থাকবে।',
  'Add partner': 'অংশীদার যোগ করুন',
  'Partner name *': 'অংশীদারের নাম *',
  'Phone': 'ফোন',
  'Ownership (%)': 'মালিকানা (%)',
  'e.g. 33.33': 'যেমন ৩৩.৩৩',
  'Active partner': 'সক্রিয় অংশীদার',
  'Partner name is required.': 'অংশীদারের নাম আবশ্যক।',
  'Ownership must be between 0% and 100%.': 'মালিকানা ০% থেকে ১০০%-এর মধ্যে হতে হবে।',
  '{name} — partner ledger': '{name} — অংশীদারের লেজার',
  'Capital': 'মূলধন',
  'Net': 'নিট',
  'Type': 'ধরন',
  'Optional note': 'ঐচ্ছিক নোট',
  'Add entry': 'এন্ট্রি যোগ করুন',
  'Loading ledger…': 'লেজার লোড হচ্ছে…',
  'No ledger entries yet': 'এখনো কোনো লেজার এন্ট্রি নেই',
  'Record capital contributions, drawings and loans above.':
    'উপরে মূলধন, উত্তোলন ও ঋণ রেকর্ড করুন।',
  'Cancel this ledger entry? The history will be kept.':
    'এই লেজার এন্ট্রি বাতিল করবেন? ইতিহাস সংরক্ষিত থাকবে।',
  'Choose a valid date.': 'সঠিক তারিখ নির্বাচন করুন।',

  // ----------------------------------------------------------- notifications
  'Automatic low-stock and expiry alerts for the whole team.':
    'পুরো দলের জন্য স্বয়ংক্রিয় কম-স্টক ও মেয়াদ সতর্কতা।',
  'Browser push': 'ব্রাউজার পুশ',
  'Enabled on this device': 'এই ডিভাইসে চালু আছে',
  'Off': 'বন্ধ',
  'Blocked in browser settings': 'ব্রাউজার সেটিংসে ব্লক করা',
  'Not supported by this browser': 'এই ব্রাউজার সমর্থন করে না',
  'Low-stock alerts are created automatically when ingredient stock hits its threshold. Enable push to receive them on this device even when the management app is closed.':
    'উপকরণের স্টক সীমায় পৌঁছালে কম-স্টক সতর্কতা স্বয়ংক্রিয়ভাবে তৈরি হয়। অ্যাপ বন্ধ থাকলেও এই ডিভাইসে সেগুলো পেতে পুশ চালু করুন।',
  'Enable browser push': 'ব্রাউজার পুশ চালু করুন',
  'Send test notification': 'পরীক্ষামূলক নোটিফিকেশন পাঠান',
  'Push was blocked — reset notification permissions in your browser settings (click the lock icon in the address bar).':
    'পুশ ব্লক করা হয়েছে — ব্রাউজার সেটিংসে নোটিফিকেশনের অনুমতি রিসেট করুন (অ্যাড্রেস বারের লক আইকনে ক্লিক করুন)।',
  'This device will now receive low-stock alerts.':
    'এই ডিভাইস এখন কম-স্টক সতর্কতা পাবে।',
  'Could not enable push: {error}': 'পুশ চালু করা যায়নি: {error}',
  'Test sent — check your notification area (works even when the app tab is in the background).':
    'পরীক্ষা পাঠানো হয়েছে — নোটিফিকেশন এলাকা দেখুন (অ্যাপ ট্যাব ব্যাকগ্রাউন্ডে থাকলেও কাজ করে)।',
  'No subscribed devices found. Enable browser push first.':
    'কোনো সাবস্ক্রাইব করা ডিভাইস পাওয়া যায়নি। আগে ব্রাউজার পুশ চালু করুন।',
  'All notifications': 'সব নোটিফিকেশন',
  'Mark all read ({count})': 'সব পড়া হিসেবে চিহ্নিত করুন ({count})',
  'No notifications yet': 'এখনো কোনো নোটিফিকেশন নেই',
  'Low-stock alerts appear automatically as ingredients run out.':
    'উপকরণ কমে গেলে কম-স্টক সতর্কতা স্বয়ংক্রিয়ভাবে দেখা যায়।',
  'Critical': 'জরুরি',
  'Warning': 'সতর্কতা',
  'Info': 'তথ্য',
  'unread': 'অপঠিত',
  'Mark read': 'পড়া হিসেবে চিহ্নিত করুন',

  // ----------------------------------------------------------------- reports
  'Last month': 'গত মাস',
  'Last 90 days': 'গত ৯০ দিন',
  'Profit & loss, daily trend, payment mix, expenses, product performance and partner balances for any date range.':
    'যেকোনো তারিখ পরিসরের জন্য লাভ-ক্ষতি, দৈনিক ধারা, পেমেন্টের মিশ্রণ, খরচ, পণ্যের পারফরম্যান্স ও অংশীদারের ব্যালেন্স।',
  'From': 'শুরু',
  'To': 'শেষ',
  'Print': 'প্রিন্ট করুন',
  'Loading report…': 'রিপোর্ট লোড হচ্ছে…',
  'Loss in this period': 'এই সময়ে লোকসান',
  'Net revenue': 'নিট আয়',
  '{count} orders · avg {amount}': '{count}টি অর্ডার · গড় {amount}',
  '{pct}% gross margin': '{pct}% মোট লাভের হার',
  'Operating expenses': 'পরিচালন খরচ',
  '{pct}% net margin': '{pct}% নিট লাভের হার',
  'Net profit': 'নিট লাভ',
  '{count} active ingredient': '{count}টি সক্রিয় উপকরণ',
  '{count} active ingredients': '{count}টি সক্রিয় উপকরণ',
  'Profit & loss': 'লাভ ও ক্ষতি',
  '{count} days': '{count} দিন',
  'Gross sales': 'মোট বিক্রয়',
  'Less discounts': 'ছাড় বাদ',
  'Less refunds': 'রিফান্ড বাদ',
  'Cost of goods sold (ingredients)': 'বিক্রীত পণ্যের ব্যয় (উপকরণ)',
  'Balances': 'ব্যালেন্স',
  'Purchases (stock received)': 'ক্রয় (প্রাপ্ত স্টক)',
  'Unpaid expenses': 'অপরিশোধিত খরচ',
  'Average order value': 'গড় অর্ডার মূল্য',
  'Daily trend': 'দৈনিক ধারা',
  'Expenses + waste': 'খরচ + অপচয়',
  'Payment mix': 'পেমেন্টের মিশ্রণ',
  'No sales in this range': 'এই পরিসরে কোনো বিক্রয় নেই',
  'Share': 'অংশ',
  'Expense breakdown': 'খরচের বিস্তারিত',
  'No expenses in this range': 'এই পরিসরে কোনো খরচ নেই',
  'Count': 'সংখ্যা',
  'Top products': 'শীর্ষ পণ্য',
  'No product sales in this range': 'এই পরিসরে কোনো পণ্য বিক্রি হয়নি',
  'Units': 'একক',
  'Partner balances': 'অংশীদারের ব্যালেন্স',
  'No partners added yet': 'এখনো কোনো অংশীদার যোগ করা হয়নি',
  'No activity in this range': 'এই পরিসরে কোনো কার্যকলাপ নেই',
  'Record sales and expenses to see the daily trend.':
    'দৈনিক ধারা দেখতে বিক্রয় ও খরচ রেকর্ড করুন।',
  'Daily revenue versus expenses': 'দৈনিক আয় বনাম খরচ',
  'revenue {amount}': 'আয় {amount}',
  'expenses + waste {amount}': 'খরচ + অপচয় {amount}',
  'Munchivo Management — financial report': 'মুচিভো ম্যানেজমেন্ট — আর্থিক রিপোর্ট',
  'Period': 'সময়কাল',
  'Amount (BDT)': 'পরিমাণ (টাকা)',
  'Discounts': 'ছাড়',
  'Refunds': 'রিফান্ড',
  'Cash & balances': 'নগদ ও ব্যালেন্স',
  'Daily summary': 'দৈনিক সারসংক্ষেপ',
  'COGS': 'পণ্যের ব্যয়',
  'Ownership %': 'মালিকানা %',

  // ---------------------------------------------------------------- settings
  'Your profile': 'আপনার প্রোফাইল',
  'Team': 'দল',
  'Manager': 'ম্যানেজার',
  'Staff': 'কর্মী',
  'Manage your account, business details and alert preferences.':
    'আপনার অ্যাকাউন্ট, ব্যবসার তথ্য ও সতর্কতার পছন্দ পরিচালনা করুন।',
  'Settings sections': 'সেটিংসের অংশসমূহ',
  'Loading settings…': 'সেটিংস লোড হচ্ছে…',
  'Password updated. Other devices were signed out.':
    'পাসওয়ার্ড আপডেট হয়েছে। অন্য ডিভাইসগুলো সাইন আউট হয়েছে।',
  'Name is required.': 'নাম আবশ্যক।',
  'Profile updated.': 'প্রোফাইল আপডেট হয়েছে।',
  'Full name *': 'পূর্ণ নাম *',
  'Email address *': 'ইমেইল ঠিকানা *',
  'This email is used to sign in. Changing it takes effect immediately; your current session stays active.':
    'এই ইমেইল দিয়ে সাইন ইন করা হয়। পরিবর্তন সাথে সাথে কার্যকর হবে; আপনার চলমান সেশন চালু থাকবে।',
  'Save profile': 'প্রোফাইল সংরক্ষণ করুন',
  'Business details': 'ব্যবসার তথ্য',
  'Business name *': 'ব্যবসার নাম *',
  'Legal / registered name': 'আইনি / নিবন্ধিত নাম',
  'Timezone': 'টাইমজোন',
  'Address': 'ঠিকানা',
  'Expiry alert window (days)': 'মেয়াদ সতর্কতার সময়সীমা (দিন)',
  'Stock is flagged when it expires within this many days. Used by the dashboard, expiry page and the daily alert job.':
    'এই কত দিনের মধ্যে মেয়াদ শেষ হলে স্টক চিহ্নিত হয়। ড্যাশবোর্ড, মেয়াদ পাতা ও দৈনিক সতর্কতার কাজে ব্যবহৃত হয়।',
  'Currency': 'মুদ্রা',
  'BDT — Bangladeshi Taka': '৳ — বাংলাদেশি টাকা',
  'Receipt footer': 'রসিদের নিচের লেখা',
  'Thank you for choosing Munchivo!': 'মুচিভো বেছে নেওয়ার জন্য ধন্যবাদ!',
  'Business settings saved.': 'ব্যবসার সেটিংস সংরক্ষিত হয়েছে।',
  'Business name is required.': 'ব্যবসার নাম আবশ্যক।',
  'Expiry alert days must be between 1 and 60.':
    'মেয়াদ সতর্কতার দিন ১ থেকে ৬০-এর মধ্যে হতে হবে।',
  'Save business settings': 'ব্যবসার সেটিংস সংরক্ষণ করুন',
  'Change password': 'পাসওয়ার্ড পরিবর্তন করুন',
  'Current password *': 'বর্তমান পাসওয়ার্ড *',
  'New password *': 'নতুন পাসওয়ার্ড *',
  'Confirm new password *': 'নতুন পাসওয়ার্ড নিশ্চিত করুন *',
  'Use at least 8 characters. For security, all other signed-in devices are logged out after the change.':
    'কমপক্ষে ৮ অক্ষর ব্যবহার করুন। নিরাপত্তার জন্য পরিবর্তনের পর অন্য সব সাইন-ইন করা ডিভাইস লগ আউট হবে।',
  'Fill in both password fields.': 'পাসওয়ার্ডের দুটি ঘরই পূরণ করুন।',
  'New password must be at least 8 characters.':
    'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।',
  'New password and confirmation do not match.':
    'নতুন পাসওয়ার্ড ও নিশ্চিতকরণ মিলছে না।',
  'Updating…': 'আপডেট হচ্ছে…',
  'Update password': 'পাসওয়ার্ড আপডেট করুন',
  'Team accounts': 'দলের অ্যাকাউন্ট',
  '{count} account': '{count}টি অ্যাকাউন্ট',
  '{count} accounts': '{count}টি অ্যাকাউন্ট',
  'Name': 'নাম',
  'Role': 'ভূমিকা',
  'Added': 'যোগ করা হয়েছে',
  'You': 'আপনি',
  'Disabled': 'নিষ্ক্রিয়',
  'Accounts are provisioned with the npm run setup:partners script. Each partner signs in with their own email and password.':
    'অ্যাকাউন্টগুলো npm run setup:partners স্ক্রিপ্ট দিয়ে তৈরি হয়। প্রতিটি অংশীদার নিজের ইমেইল ও পাসওয়ার্ড দিয়ে সাইন ইন করেন।',
}

function interpolate(template, params) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params[key] === undefined ? match : String(params[key]),
  )
}

const LangContext = createContext({
  lang: 'en',
  locale: 'en-US',
  t: (text) => text,
  setLanguage: () => {},
  languages: LANGUAGES,
})

export function useTranslation() {
  return useContext(LangContext)
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored && stored in LANGUAGES ? stored : 'en'
    } catch {
      return 'en'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // private browsing — the switch still works for this session
    }
    document.documentElement.lang = lang
    document.title = lang === 'bn' ? 'মুচিভো ম্যানেজমেন্ট' : 'Munchivo Management'
  }, [lang])

  const t = useCallback(
    (text, params) => {
      if (text === null || text === undefined || text === '') return text
      const translated = (lang === 'bn' && BANGLA[text]) || text
      return interpolate(translated, params)
    },
    [lang],
  )

  const setLanguage = useCallback((next) => {
    if (!(next in LANGUAGES)) return
    setLang(next)
  }, [])

  const value = useMemo(
    () => ({ lang, locale: lang === 'bn' ? 'bn-BD' : 'en-US', t, setLanguage, languages: LANGUAGES }),
    [lang, setLanguage, t],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}
