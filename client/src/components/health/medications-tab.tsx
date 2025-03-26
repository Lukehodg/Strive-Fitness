import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, addDays, isBefore, isToday } from 'date-fns';
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Check, Plus, X } from "lucide-react";

// Define medication/schedule interfaces
interface Medication {
  id: number;
  userId: number;
  name: string;
  type: string;
  dosage: string;
  frequency: string;
  startDate: string | Date;
  endDate: string | Date | null;
  notes: string | null;
  isActive: boolean | null;
}

interface MedicationSchedule {
  id: number;
  medicationId: number;
  scheduledTime: string | Date;
  takenTime: string | Date | null;
  isTaken: boolean | null;
  skipped: boolean | null;
  notes: string | null;
  injectionSite: string | null;
}

type MedicationsResponse = Medication[];
type SchedulesResponse = MedicationSchedule[];

const medicationSchema = z.object({
  name: z.string().min(1, "Medication name is required"),
  type: z.string().min(1, "Medication type is required"),
  dosage: z.string().min(1, "Dosage is required"),
  frequency: z.string().min(1, "Frequency is required"),
  startDate: z.date(),
  endDate: z.date().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean().default(true),
});

const scheduleSchema = z.object({
  scheduledTime: z.date(),
  notes: z.string().nullable(),
  injectionSite: z.string().nullable(),
});

export default function MedicationsTab() {
  const [selectedTab, setSelectedTab] = useState("active");
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [isMedicationDialogOpen, setIsMedicationDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = new Date();
  
  // Get current user (hardcoded to id 1 for now)
  const userId = 1;
  
  // Define available medication types
  const medicationTypes = ['pill', 'tablet', 'capsule', 'liquid', 'injection', 'topical', 'inhaler', 'patch', 'other'];
  
  // Define available injection sites
  const injectionSites = ['left_thigh', 'right_thigh', 'left_arm', 'right_arm', 'abdomen', 'buttocks', 'other'];
  
  // Queries
  const { data: medications = [], isLoading: isMedicationsLoading } = useQuery<MedicationsResponse>({
    queryKey: ['/api/users/1/medications'],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}/medications`);
      if (!response.ok) throw new Error('Failed to fetch medications');
      return await response.json();
    }
  });
  
  // Get active medications query
  const { data: activeMedications = [] } = useQuery<MedicationsResponse>({
    queryKey: ['/api/users/1/medications/active'],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}/medications/active`);
      if (!response.ok) throw new Error('Failed to fetch active medications');
      return await response.json();
    }
  });
  
  // Get today's medication schedules
  const { data: schedules = [], isLoading: isSchedulesLoading } = useQuery<SchedulesResponse>({
    queryKey: ['/api/users/1/medication-schedules', today.toISOString()],
    queryFn: async () => {
      // Get schedules for today
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      const response = await fetch(`/api/users/${userId}/medication-schedules?startDate=${todayStart.toISOString()}&endDate=${todayEnd.toISOString()}`);
      if (!response.ok) throw new Error('Failed to fetch medication schedules');
      return await response.json();
    }
  });
  
  // Group schedules by medication
  const groupedSchedules: Record<number, MedicationSchedule[]> = {};
  
  if (schedules) {
    schedules.forEach((schedule: MedicationSchedule) => {
      if (!groupedSchedules[schedule.medicationId]) {
        groupedSchedules[schedule.medicationId] = [];
      }
      groupedSchedules[schedule.medicationId].push(schedule);
    });
  }
  
  // Filter active medications
  const filteredMedications = selectedTab === 'active' 
    ? medications.filter((med: Medication) => med.isActive)
    : medications;
  
  // Medication form setup
  const medicationForm = useForm<z.infer<typeof medicationSchema>>({
    resolver: zodResolver(medicationSchema),
    defaultValues: {
      name: "",
      type: "pill",
      dosage: "",
      frequency: "",
      startDate: new Date(),
      endDate: null,
      notes: "",
      isActive: true,
    }
  });
  
  // Schedule form setup
  const scheduleForm = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      scheduledTime: new Date(),
      notes: "",
      injectionSite: null,
    }
  });
  
  // Handle medication form submission
  const medicationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof medicationSchema>) => {
      if (selectedMedication) {
        // Update existing medication
        return await apiRequest("PATCH", `/api/medications/${selectedMedication.id}`, data);
      } else {
        // Create new medication
        return await apiRequest("POST", "/api/medications", {
          ...data,
          userId
        });
      }
    },
    onSuccess: () => {
      // Invalidate queries to reload data
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/medications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/medications/active'] });
      
      // Reset form and close dialog
      medicationForm.reset();
      setIsMedicationDialogOpen(false);
      setSelectedMedication(null);
      
      toast({
        title: selectedMedication ? "Medication updated" : "Medication added",
        description: selectedMedication 
          ? "The medication has been updated successfully."
          : "The medication has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${selectedMedication ? 'update' : 'add'} medication: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Handle medication schedule form submission
  const scheduleMutation = useMutation({
    mutationFn: async (data: z.infer<typeof scheduleSchema>) => {
      // Create new schedule
      return await apiRequest("POST", "/api/medication-schedules", {
        ...data,
        medicationId: selectedMedication?.id
      });
    },
    onSuccess: () => {
      // Invalidate queries to reload data
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/medication-schedules'] });
      
      // Reset form and close dialog
      scheduleForm.reset();
      setIsScheduleDialogOpen(false);
      
      toast({
        title: "Schedule added",
        description: "The medication schedule has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add schedule: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Handle marking a schedule as taken
  const markScheduleTakenMutation = useMutation({
    mutationFn: async ({ id, isTaken }: { id: number, isTaken: boolean }) => {
      return await apiRequest("PATCH", `/api/medication-schedules/${id}`, {
        isTaken,
        takenTime: isTaken ? new Date() : null
      });
    },
    onSuccess: () => {
      // Invalidate queries to reload data
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/medication-schedules'] });
      
      toast({
        title: "Schedule updated",
        description: "The medication schedule has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update schedule: ${error}`,
        variant: "destructive",
      });
    }
  });
  
  // Handle medication form submission
  const handleMedicationSubmit = (data: z.infer<typeof medicationSchema>) => {
    medicationMutation.mutate(data);
  };
  
  // Handle schedule form submission
  const handleScheduleSubmit = (data: z.infer<typeof scheduleSchema>) => {
    scheduleMutation.mutate(data);
  };
  
  // Set form values when editing a medication
  const handleEditMedication = (medication: Medication) => {
    setSelectedMedication(medication);
    
    medicationForm.reset({
      name: medication.name,
      type: medication.type,
      dosage: medication.dosage,
      frequency: medication.frequency,
      startDate: new Date(medication.startDate),
      endDate: medication.endDate ? new Date(medication.endDate) : null,
      notes: medication.notes,
      isActive: medication.isActive === null ? true : medication.isActive,
    });
    
    setIsMedicationDialogOpen(true);
  };
  
  // Setup for adding a schedule
  const handleAddSchedule = (medication: Medication) => {
    setSelectedMedication(medication);
    
    scheduleForm.reset({
      scheduledTime: new Date(),
      notes: "",
      injectionSite: medication.type === "injection" ? "left_thigh" : null,
    });
    
    setIsScheduleDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Medications & Supplements</h2>
        <Button onClick={() => {
          setSelectedMedication(null);
          medicationForm.reset();
          setIsMedicationDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Medication
        </Button>
      </div>
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="all">All Medications</TabsTrigger>
          <TabsTrigger value="schedule">Today's Schedule</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="pt-4">
          {isMedicationsLoading ? (
            <div className="flex justify-center">Loading active medications...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMedications?.length ? (
                filteredMedications.map((medication: Medication) => (
                  <MedicationCard 
                    key={medication.id} 
                    medication={medication} 
                    onEdit={() => handleEditMedication(medication)}
                    onAddSchedule={() => handleAddSchedule(medication)}
                    schedules={groupedSchedules[medication.id] || []}
                    onMarkTaken={(scheduleId, isTaken) => markScheduleTakenMutation.mutate({ id: scheduleId, isTaken })}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">No active medications found</p>
                  <Button variant="outline" onClick={() => setIsMedicationDialogOpen(true)} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Medication
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="pt-4">
          {isMedicationsLoading ? (
            <div className="flex justify-center">Loading medications...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {medications?.length ? (
                medications.map((medication: Medication) => (
                  <MedicationCard 
                    key={medication.id} 
                    medication={medication} 
                    onEdit={() => handleEditMedication(medication)}
                    onAddSchedule={() => handleAddSchedule(medication)}
                    schedules={groupedSchedules[medication.id] || []}
                    onMarkTaken={(scheduleId, isTaken) => markScheduleTakenMutation.mutate({ id: scheduleId, isTaken })}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">No medications found</p>
                  <Button variant="outline" onClick={() => setIsMedicationDialogOpen(true)} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Medication
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="schedule" className="pt-4">
          {isSchedulesLoading ? (
            <div className="flex justify-center">Loading today's schedule...</div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">{format(today, 'EEEE, MMMM do, yyyy')}</h2>
              
              <div className="space-y-4">
                {schedules?.length ? (
                  schedules.map((schedule: MedicationSchedule) => {
                    const medication = medications.find((med: Medication) => med.id === schedule.medicationId);
                    return (
                      <ScheduleItem 
                        key={schedule.id}
                        schedule={schedule}
                        medication={medication}
                        onMarkTaken={(isTaken) => markScheduleTakenMutation.mutate({ id: schedule.id, isTaken })}
                      />
                    );
                  })
                ) : (
                  <div className="text-center py-10">
                    <p className="text-muted-foreground">No medications scheduled for today</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Medication Dialog */}
      <Dialog open={isMedicationDialogOpen} onOpenChange={setIsMedicationDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{selectedMedication ? 'Edit Medication' : 'Add New Medication'}</DialogTitle>
            <DialogDescription>
              Enter the details of your medication or supplement.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...medicationForm}>
            <form onSubmit={medicationForm.handleSubmit(handleMedicationSubmit)} className="space-y-4">
              <FormField
                control={medicationForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Vitamin D3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {medicationTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="dosage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dosage</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 1000mg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Once daily" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className="w-full pl-3 text-left font-normal"
                          >
                            {field.value ? (
                              format(field.value, "MMMM d, yyyy")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date (Optional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className="w-full pl-3 text-left font-normal"
                          >
                            {field.value ? (
                              format(field.value, "MMMM d, yyyy")
                            ) : (
                              <span>No end date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                          disabled={(date) => {
                            const startDate = medicationForm.getValues("startDate");
                            return date < startDate;
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Take with food" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={medicationForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        This medication is currently being taken
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="submit">
                  {selectedMedication ? "Update Medication" : "Add Medication"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Schedule</DialogTitle>
            <DialogDescription>
              Add a schedule for this medication.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...scheduleForm}>
            <form onSubmit={scheduleForm.handleSubmit(handleScheduleSubmit)} className="space-y-4">
              <FormField
                control={scheduleForm.control}
                name="scheduledTime"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Schedule Time</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className="w-full pl-3 text-left font-normal"
                          >
                            {field.value ? (
                              format(field.value, "MMMM d, yyyy h:mm a")
                            ) : (
                              <span>Pick a date and time</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              const currentDate = field.value;
                              const hours = currentDate.getHours();
                              const minutes = currentDate.getMinutes();
                              date.setHours(hours, minutes);
                              field.onChange(date);
                            }
                          }}
                          initialFocus
                        />
                        <div className="border-t border-border p-3 flex justify-between">
                          <Select 
                            defaultValue={field.value.getHours().toString()}
                            onValueChange={(value) => {
                              const date = new Date(field.value);
                              date.setHours(parseInt(value));
                              field.onChange(date);
                            }}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue placeholder="Hour" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {i.toString().padStart(2, '0')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-xl">:</span>
                          <Select 
                            defaultValue={field.value.getMinutes().toString()}
                            onValueChange={(value) => {
                              const date = new Date(field.value);
                              date.setMinutes(parseInt(value));
                              field.onChange(date);
                            }}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue placeholder="Min" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 60 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {i.toString().padStart(2, '0')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={scheduleForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Take after breakfast" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {selectedMedication?.type === "injection" && (
                <FormField
                  control={scheduleForm.control}
                  name="injectionSite"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Injection Site</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value)} defaultValue={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select injection site" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {injectionSites.map(site => (
                            <SelectItem key={site} value={site}>
                              {site.charAt(0).toUpperCase() + site.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <DialogFooter>
                <Button type="submit">Add Schedule</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Medication card component
interface MedicationCardProps {
  medication: Medication;
  onEdit: () => void;
  onAddSchedule: () => void;
  schedules: MedicationSchedule[];
  onMarkTaken: (scheduleId: number, isTaken: boolean) => void;
}

function MedicationCard({ medication, onEdit, onAddSchedule, schedules, onMarkTaken }: MedicationCardProps) {
  const todaySchedules = schedules.filter(schedule => {
    const scheduleDate = new Date(schedule.scheduledTime);
    return isToday(scheduleDate);
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="mb-1">{medication.name}</CardTitle>
            <CardDescription>
              {medication.type.charAt(0).toUpperCase() + medication.type.slice(1)} • {medication.dosage}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Frequency:</span>
            <span>{medication.frequency}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Started:</span>
            <span>{format(new Date(medication.startDate), 'MMM d, yyyy')}</span>
          </div>
          {medication.endDate && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Ends:</span>
              <span>{format(new Date(medication.endDate), 'MMM d, yyyy')}</span>
            </div>
          )}
          {medication.notes && (
            <div className="text-sm mt-2">
              <span className="text-muted-foreground block">Notes:</span>
              <span className="block mt-1">{medication.notes}</span>
            </div>
          )}
          
          {todaySchedules.length > 0 && (
            <div className="mt-3 space-y-2">
              <h4 className="text-sm font-medium">Today's Schedule:</h4>
              {todaySchedules.map(schedule => (
                <div key={schedule.id} className="flex justify-between items-center bg-muted/30 p-2 rounded text-sm">
                  <span>{format(new Date(schedule.scheduledTime), 'h:mm a')}</span>
                  {schedule.isTaken ? (
                    <span className="flex items-center text-green-500">
                      <Check className="h-4 w-4 mr-1" /> Taken
                    </span>
                  ) : (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 rounded-full px-2"
                      onClick={() => onMarkTaken(schedule.id, true)}
                    >
                      Take
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          variant="outline" 
          className="w-full"
          onClick={onAddSchedule}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Schedule
        </Button>
      </CardFooter>
    </Card>
  );
}

// Schedule item component
interface ScheduleItemProps {
  schedule: MedicationSchedule;
  medication?: Medication;
  onMarkTaken: (isTaken: boolean) => void;
}

function ScheduleItem({ schedule, medication, onMarkTaken }: ScheduleItemProps) {
  const scheduleTime = new Date(schedule.scheduledTime);
  const isPast = isBefore(scheduleTime, new Date());
  
  return (
    <Card className={schedule.isTaken ? "border-green-500/20 bg-green-500/5" : (isPast ? "border-amber-500/20 bg-amber-500/5" : "")}>
      <CardContent className="p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-medium text-lg">{medication?.name || "Medication"}</h3>
            <p className="text-muted-foreground">
              {format(scheduleTime, 'h:mm a')} • {medication?.dosage || ""}
            </p>
            {schedule.notes && (
              <p className="text-sm mt-1">{schedule.notes}</p>
            )}
            {schedule.injectionSite && (
              <p className="text-sm mt-1">
                <span className="text-muted-foreground">Injection site:</span> {schedule.injectionSite.replace('_', ' ')}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {schedule.isTaken ? (
              <>
                <span className="text-green-500 flex items-center">
                  <Check className="h-4 w-4 mr-1" /> Taken
                </span>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => onMarkTaken(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button 
                size="sm" 
                onClick={() => onMarkTaken(true)}
              >
                Mark as Taken
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}