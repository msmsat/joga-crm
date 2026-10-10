from .base import Base, user_services
from .studio import Studio
from .studio_branch import StudioBranch, BranchWorkingHours
from .studio_member import StudioMember
from .user import User, UserConsent
from .client import Client, ClientEmailOtp, ClientSubscription, ClientPayment, ClientNote, StudioClientSegmentConfig
from .bumpix import BumpixClient, BumpixSnapshot, BumpixJournalLink, BumpixEvent, BumpixMedia
from .identity import CustomerIdentity
from .proposal import ActionProposal
from .schedule import Hall, Lesson, Reservation
from .service import Service, ServiceBundleItem, ServiceScheduleSlot
from .recurring_schedule import RecurringLessonTemplate, RecurringLessonOccurrence
from .booking_notification import BookingNotificationIntent
from .booking_quote import BookingQuote
from .settings import (
    StudioWorkingHours,
    StudioNotificationSettings,
    NotificationEventToggle,
    NotificationLog,
    InboundEvent,
    AgentJob,
    ChannelThread,
    ThreadOption,
    OutboundMessage,
    StudioFeatureFlag,
    UserNotificationPreference,
    StudioBookingSettings,
    BookingChannelConfig,
    StudioBillingPlan,
    PaymentCard,
    BillingInvoice,
    FxRate,
    OfflineTransactionFee,
    PlatformRevenueLedger,
    UserSession,
    StudioIntegration,
)
from .billing_tax_document import BillingTaxDocument
from .staff import StaffWorkingHours, StaffDayOverride, StaffBranchAssignment, StaffBusyInterval
from .finances import (
    Account,
    Operation,
    Counterparty,
    FinDocument,
    OnlineChannel,
    PaymentMethodConfig,
    FinancialGoal,
    SalaryPayment,
    OnlineChannelMetric,
    StripeCheckout,
)
from .ai import StudioAISettings, AIChatSession, AIChatMessage, AIStudioFact, AIUsage
from .loyalty import (
    StudioLoyaltyConfig,
    LoyaltyLevel,
    ClientLoyaltyCard,
    LoyaltyPointTransaction,
    DepositTransaction,
    StudioDiscountConfig,
    DiscountCampaign,
    StudioCertificateConfig,
    GiftCertificate,
    StudioSubscriptionProgramConfig,
    SubscriptionPackage,
    StudioReferralConfig,
    ReferralRecord,
    StudioPromoCode,
    LoyaltyScenario,
    ScenarioFire,
    ClientOffer,
)
from .products import Product, ProductSale
from .events import StudioEvent, EventAttendee
from .reports import StudioReview, ActivityLog, TrainerSalesGoal, StudioTask
from .analytics import DailyMetricSnapshot
from .platform import LandingVisit

__all__ = [
    'BumpixClient', 'BumpixSnapshot', 'BumpixJournalLink', 'BumpixEvent', 'BumpixMedia',
    "Base",
    "user_services",
    "Studio",
    "StudioBranch",
    "BranchWorkingHours",
    "StudioMember",
    "User",
    "UserConsent",
    "Client",
    "ClientEmailOtp",
    "ClientSubscription",
    "ClientPayment",
    "ClientNote",
    "StudioClientSegmentConfig",
    "Hall",
    "Lesson",
    "Reservation",
    "Service",
    "ServiceBundleItem",
    "ServiceScheduleSlot",
    "BookingNotificationIntent",
    "BookingQuote",
    "StudioWorkingHours",
    "StudioNotificationSettings",
    "NotificationEventToggle",
    "NotificationLog",
    "UserNotificationPreference",
    "StudioBookingSettings",
    "BookingChannelConfig",
    "StudioBillingPlan",
    "PaymentCard",
    "BillingInvoice",
    "BillingTaxDocument",
    "FxRate",
    "OfflineTransactionFee",
    "PlatformRevenueLedger",
    "UserSession",
    "StudioIntegration",
    "StaffWorkingHours",
    "StaffDayOverride",
    "StaffBranchAssignment",
    "StaffBusyInterval",
    "Account",
    "Operation",
    "Counterparty",
    "FinDocument",
    "OnlineChannel",
    "PaymentMethodConfig",
    "FinancialGoal",
    "SalaryPayment",
    "OnlineChannelMetric",
    "StripeCheckout",
    "StudioAISettings",
    "AIChatSession",
    "AIChatMessage",
    "AIStudioFact",
    "AIUsage",
    "StudioLoyaltyConfig",
    "LoyaltyLevel",
    "ClientLoyaltyCard",
    "LoyaltyPointTransaction",
    "DepositTransaction",
    "StudioDiscountConfig",
    "DiscountCampaign",
    "StudioCertificateConfig",
    "GiftCertificate",
    "StudioSubscriptionProgramConfig",
    "SubscriptionPackage",
    "StudioReferralConfig",
    "ReferralRecord",
    "StudioPromoCode",
    "LoyaltyScenario",
    "ScenarioFire",
    "ClientOffer",
    "Product",
    "ProductSale",
    "StudioEvent",
    "EventAttendee",
    "StudioReview",
    "ActivityLog",
    "TrainerSalesGoal",
    "StudioTask",
    "DailyMetricSnapshot",
    "LandingVisit",
]

from .studio_setup import StudioSetupLink
