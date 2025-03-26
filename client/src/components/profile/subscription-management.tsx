import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Check, Crown, AlertTriangle } from 'lucide-react';

// Types
interface SubscriptionPlan {
  id: number;
  name: string;
  planType: 'free' | 'basic' | 'premium' | 'elite';
  description: string;
  price: number;
  billingCycle: string;
  features: string[];
  isActive: boolean;
  maxWorkoutTemplates: number | null;
  maxHealthMetrics: number | null;
  maxMedications: number | null;
  allowAnalytics: boolean | null;
  allowIntegrations: boolean | null;
  allowPdfUpload: boolean | null;
}

interface SubscriptionDetails {
  plan: SubscriptionPlan;
  expiryDate: string | null;
}

interface PaymentInfo {
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  name: string;
}

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(price);
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
};

// For demonstration purposes only - in a real app this would connect to a payment processor
const processMockPayment = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 2000);
  });
};

const getGradientColor = (planType: string): string => {
  switch (planType) {
    case 'basic':
      return 'from-blue-500 to-blue-700';
    case 'premium':
      return 'from-purple-500 to-purple-800';
    case 'elite':
      return 'from-amber-400 to-amber-700';
    default:
      return 'from-gray-500 to-gray-700';
  }
};

export default function SubscriptionManagement() {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    name: '',
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Query to get subscription plans
  const { data: plans, isLoading: isLoadingPlans } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/subscription-plans'],
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Query to get user's current subscription
  const { data: subscription, isLoading: isLoadingSubscription } = useQuery<SubscriptionDetails>({
    queryKey: ['/api/users/1/subscription'],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Mutation to update subscription
  const updateSubscriptionMutation = useMutation({
    mutationFn: async (data: { planType: string }) => {
      // Calculate expiry date 1 month from now for monthly plans
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      
      const res = await apiRequest(
        'POST',
        '/api/users/1/subscription',
        {
          planType: data.planType,
          expiryDate: expiryDate.toISOString(),
        }
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/subscription'] });
      toast({
        title: 'Subscription Updated',
        description: `You are now subscribed to the ${selectedPlan?.name} plan.`,
      });
      setIsPaymentDialogOpen(false);
      setSelectedPlan(null);
      setIsProcessingPayment(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to update subscription: ${error.message}`,
        variant: 'destructive',
      });
      setIsProcessingPayment(false);
    }
  });

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (plan.planType === 'free') {
      // Free plan doesn't need payment
      updateSubscriptionMutation.mutate({ planType: plan.planType });
      return;
    }
    
    setSelectedPlan(plan);
    setIsPaymentDialogOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    
    setIsProcessingPayment(true);
    
    // This would be replaced with an actual payment processor in a real app
    try {
      const paymentSuccess = await processMockPayment();
      if (paymentSuccess) {
        updateSubscriptionMutation.mutate({ planType: selectedPlan.planType });
      } else {
        toast({
          title: 'Payment Failed',
          description: 'There was an issue processing your payment. Please try again.',
          variant: 'destructive',
        });
        setIsProcessingPayment(false);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
      setIsProcessingPayment(false);
    }
  };

  if (isLoadingPlans || isLoadingSubscription) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading subscription information...</p>
      </div>
    );
  }

  const currentPlan = subscription?.plan;

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-2xl font-bold">Subscription Management</h2>
        <p className="text-muted-foreground">
          Manage your subscription plan and billing information
        </p>
      </div>

      {/* Current Subscription */}
      {currentPlan && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Current Plan</CardTitle>
                <CardDescription>Your current subscription details</CardDescription>
              </div>
              <Badge variant="outline" className="text-primary border-primary">
                Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Crown className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">{currentPlan.name}</h3>
                </div>
                <span className="text-lg font-semibold">
                  {formatPrice(currentPlan.price)}/{currentPlan.billingCycle}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <div className="text-muted-foreground">Plan Type:</div>
                <div className="font-medium capitalize">{currentPlan.planType}</div>
                <div className="text-muted-foreground">Expiry Date:</div>
                <div className="font-medium">{formatDate(subscription?.expiryDate)}</div>
                <div className="text-muted-foreground">Max Workout Templates:</div>
                <div className="font-medium">{currentPlan.maxWorkoutTemplates || 'Unlimited'}</div>
                <div className="text-muted-foreground">Max Health Metrics:</div>
                <div className="font-medium">{currentPlan.maxHealthMetrics || 'Unlimited'}</div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end pt-0">
            <Button variant="outline" disabled={currentPlan.planType === 'free'}>
              Manage Billing
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Available Plans */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Available Plans</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans?.map((plan) => (
            <Card 
              key={plan.id} 
              className={`border-2 ${
                currentPlan?.id === plan.id ? 'border-primary' : 'border-border'
              } transition-all hover:shadow-md`}
            >
              <CardHeader 
                className={`bg-gradient-to-r ${getGradientColor(plan.planType)} text-white`}
              >
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription className="text-white/80">{plan.description}</CardDescription>
                <div className="flex items-baseline mt-2">
                  <span className="text-2xl font-bold">{formatPrice(plan.price)}</span>
                  <span className="ml-1 text-sm text-white/90">/{plan.billingCycle}</span>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant={currentPlan?.id === plan.id ? "outline" : "default"}
                  onClick={() => handleSelectPlan(plan)}
                  disabled={currentPlan?.id === plan.id}
                >
                  {currentPlan?.id === plan.id ? 'Current Plan' : 'Select Plan'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subscribe to {selectedPlan?.name}</DialogTitle>
            <DialogDescription>
              Enter your payment information to subscribe to the {selectedPlan?.name} plan
              for {formatPrice(selectedPlan?.price || 0)}/{selectedPlan?.billingCycle}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePaymentSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Cardholder Name</Label>
                <input
                  id="name"
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="John Doe"
                  required
                  value={paymentInfo.name}
                  onChange={(e) => setPaymentInfo({...paymentInfo, name: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card Number</Label>
                <input
                  id="cardNumber"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9\s]{13,19}"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="4242 4242 4242 4242"
                  required
                  value={paymentInfo.cardNumber}
                  onChange={(e) => setPaymentInfo({...paymentInfo, cardNumber: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cardExpiry">Expiry Date</Label>
                  <input
                    id="cardExpiry"
                    type="text"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="MM/YY"
                    required
                    value={paymentInfo.cardExpiry}
                    onChange={(e) => setPaymentInfo({...paymentInfo, cardExpiry: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cardCvc">CVC</Label>
                  <input
                    id="cardCvc"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{3,4}"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="123"
                    required
                    value={paymentInfo.cardCvc}
                    onChange={(e) => setPaymentInfo({...paymentInfo, cardCvc: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 text-amber-500">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-xs">
                  This is a demonstration. No actual payment will be processed.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsPaymentDialogOpen(false)}
                disabled={isProcessingPayment}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isProcessingPayment}>
                {isProcessingPayment ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing
                  </>
                ) : (
                  `Pay ${formatPrice(selectedPlan?.price || 0)}`
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}