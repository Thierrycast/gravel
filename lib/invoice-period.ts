import { addMonths, startOfMonth, setDate, subMonths } from "date-fns";

/**
 * Calculates the start and end dates of a credit card billing cycle
 * based on the closing day of the month.
 * 
 * Example: if closingDay is 3 and today is May 30th:
 * The current cycle closes on June 3rd.
 * It started on May 4th.
 * 
 * @param closingDay The day of the month when the invoice closes (1-31)
 * @param date The reference date (defaults to now)
 */
export function getInvoicePeriod(closingDay: number, date = new Date()) {
  const currentMonth = startOfMonth(date);
  
  // Potential closing date in the current month
  const closingDate = setDate(currentMonth, closingDay);
  
  // then the "current" invoice is the one that will close NEXT month.
  if (date > closingDate) {
    const start = setDate(currentMonth, closingDay + 1);
    const end = setDate(addMonths(currentMonth, 1), closingDay);
    return { start, end };
  } else {
    // Reference date is before or on the closing date of this month.
    // The "current" invoice closes this month.
    const start = setDate(subMonths(currentMonth, 1), closingDay + 1);
    const end = closingDate;
    return { start, end };
  }
}

/**
 * Returns the period for the "previous" invoice cycle.
 */
export function getPreviousInvoicePeriod(closingDay: number, date = new Date()) {
  const currentCycle = getInvoicePeriod(closingDay, date);
  return getInvoicePeriod(closingDay, subMonths(currentCycle.start, 1));
}
